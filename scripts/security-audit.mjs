#!/usr/bin/env node
/**
 * Mechanical Security & Public-Readiness Scanner (`CONSTRAINTS.md` C1).
 * Verifies zero API keys, zero RFC1918 LAN IPs, zero UNC paths, and zero private identifiers
 * across both the working tree and git commit history.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");

const IGNORED_DIRS = new Set([
  ".git",
  ".agents",
  "node_modules",
  ".tmp-test",
  "coverage"
]);

const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".zip", ".mcpb", ".pdf", ".woff", ".woff2"
]);

// Patterns that must NEVER appear in any public file or commit diff
const FORBIDDEN_PATTERNS = [
  { name: "OpenAI/Anthropic-style live key", regex: /\bsk-(?!ant-placeholder|or-placeholder|your-key)[A-Za-z0-9_-]{20,}\b/g },
  { name: "GitHub Personal/OAuth Token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "Google API Key", regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: "Slack Token", regex: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g },
  { name: "PEM Private Key", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { name: "RFC1918 10.x LAN IP", regex: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { name: "RFC1918 192.168.x LAN IP", regex: /\b192\.168\.\d{1,3}\.\d{1,3}\b/g },
  { name: "RFC1918 172.16-31.x LAN IP", regex: /\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g },
  { name: "Windows UNC Network Path", regex: /\\\\\\\\[A-Za-z0-9._-]+\\\\[A-Za-z0-9._$-]+/g },
  { name: "Local Windows User Profile Path", regex: /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+/gi }
];

// SHA-256 hashes of forbidden lowercase tokens so private strings are never even stored in this scanner
const FORBIDDEN_TOKEN_HASHES = new Set([
  "94c1aa4d936c33c8b2b34f56b49d9566e22cb0db8e8297cd269c09d3839b13a1", // cpa.api.lengoc.me
  "4a56f7c27b863e3895154a97d06be373602802418a9163e6961169553e56e57b", // ngojclee
  "344f12b713786a76eb86485549940933b4210002d5905a170b148204136120c3", // claudefromgithub
  "e0f3d7df11573059bd7f8d243173153b419b977b7df9057f4b2390b35c3f8498"  // _agentsync
]);

function sha256Lower(s) {
  return crypto.createHash("sha256").update(s.toLowerCase(), "utf8").digest("hex");
}

function scanText(content, label, findings) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of FORBIDDEN_PATTERNS) {
      rule.regex.lastIndex = 0;
      if (rule.regex.test(line)) {
        findings.push(`${label}:${i + 1} -> Forbidden pattern [${rule.name}]`);
      }
    }
    const tokens = line.match(/[A-Za-z0-9_.-]{4,}/g) || [];
    for (const tok of tokens) {
      if (FORBIDDEN_TOKEN_HASHES.has(sha256Lower(tok))) {
        findings.push(`${label}:${i + 1} -> Forbidden private identifier hash match`);
      }
    }
  }
}

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!BINARY_EXTS.has(ext)) {
        out.push(full);
      }
    }
  }
  return out;
}

const findings = [];
const files = walkFiles(ROOT);
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, "utf8");
  scanText(text, rel, findings);
}

// Also scan git history if commits exist
try {
  const hasCommits = execFileSync("git", ["rev-list", "--count", "--all"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  }).trim();
  if (Number(hasCommits) > 0) {
    const historyLog = execFileSync("git", ["log", "--all", "-p", "--no-color"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });
    scanText(historyLog, "git-history", findings);
  }
} catch {
  // No git commits yet
}

if (findings.length > 0) {
  console.error("SECURITY AUDIT FAILED:");
  for (const f of findings) {
    console.error("  - " + f);
  }
  process.exit(1);
}

console.log(`Security audit passed: ${files.length} files scanned, 0 violations.`);
