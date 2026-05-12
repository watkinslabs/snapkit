#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const repoRoot = resolve(__dirname, '..');
const extensionDir = join(repoRoot, 'snapkit@watkinslabs');
const metadataPath = join(extensionDir, 'metadata.json');
const schemaPath = join(
    extensionDir,
    'schemas',
    'org.gnome.shell.extensions.snapkit.gschema.xml'
);
const debugPath = join(extensionDir, 'src', 'core', 'debug.js');

function info(message) {
    console.log(`[validate] ${message}`);
}

function fail(message) {
    console.error(`[validate] ERROR: ${message}`);
    process.exit(1);
}

function runOrFail(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        stdio: 'inherit',
        ...options
    });

    if (result.error) {
        fail(`failed to execute "${command}": ${result.error.message}`);
    }

    if (result.status !== 0) {
        const argString = args.length > 0 ? ` ${args.join(' ')}` : '';
        fail(`command failed: ${command}${argString} (exit ${result.status})`);
    }
}

function validateStructure() {
    const requiredFiles = [
        join(extensionDir, 'extension.js'),
        join(extensionDir, 'prefs.js'),
        metadataPath,
        schemaPath
    ];

    for (const filePath of requiredFiles) {
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
            fail(`required file is missing: ${filePath}`);
        }
    }

    const requiredDirs = [
        join(extensionDir, 'src'),
        join(extensionDir, 'schemas')
    ];

    for (const dirPath of requiredDirs) {
        if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
            fail(`required directory is missing: ${dirPath}`);
        }
    }
}

function validateMetadata() {
    let metadata;
    try {
        metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    } catch (error) {
        fail(`invalid metadata.json: ${error.message}`);
    }

    if (metadata.uuid !== 'snapkit@watkinslabs') {
        fail(`metadata uuid mismatch: expected "snapkit@watkinslabs", got "${metadata.uuid}"`);
    }

    if (!Array.isArray(metadata['shell-version']) || metadata['shell-version'].length === 0) {
        fail('metadata shell-version must be a non-empty array');
    }
}

function validateSchemaKeys() {
    const schemaXml = readFileSync(schemaPath, 'utf8');
    const keyMatches = schemaXml.matchAll(/<key\s+name="([^"]+)"/g);
    const keySet = new Set([...keyMatches].map(match => match[1]));

    const requiredKeys = [
        'default-layout',
        'custom-layouts',
        'divider-overrides',
        'auto-snap-on-drag',
        'restore-on-unsnap',
        'drag-zone-modifier-disables-zones',
        'drag-zone-modifier-key',
        'live-resize-updates',
        'shake-enabled',
        'shake-window-ms',
        'shake-min-delta',
        'shake-direction-changes'
    ];

    const missing = requiredKeys.filter(key => !keySet.has(key));
    if (missing.length > 0) {
        fail(`schema is missing required key(s): ${missing.join(', ')}`);
    }
}

function validateSchemaCompilation() {
    const tempSchemaDir = mkdtempSync(join(tmpdir(), 'snapkit-schema-'));

    try {
        copyFileSync(
            schemaPath,
            join(tempSchemaDir, 'org.gnome.shell.extensions.snapkit.gschema.xml')
        );
        runOrFail('glib-compile-schemas', [tempSchemaDir]);
    } finally {
        rmSync(tempSchemaDir, { recursive: true, force: true });
    }
}

function validateDebugDefault() {
    const debugSource = readFileSync(debugPath, 'utf8');
    if (!debugSource.includes('export const DEBUG_LOGGING_ENABLED = false;')) {
        fail('src/core/debug.js must default DEBUG_LOGGING_ENABLED to false');
    }
}

function collectJsFiles(dirPath, files = []) {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name.startsWith('.')) {
            continue;
        }

        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
            collectJsFiles(fullPath, files);
            continue;
        }

        if (entry.isFile() && fullPath.endsWith('.js')) {
            files.push(fullPath);
        }
    }

    return files;
}

function validateSyntax() {
    const jsFiles = collectJsFiles(extensionDir);
    if (jsFiles.length === 0) {
        fail(`no JavaScript files found under ${extensionDir}`);
    }

    for (const filePath of jsFiles) {
        const result = spawnSync(process.execPath, ['--check', filePath], {
            cwd: repoRoot,
            encoding: 'utf8'
        });

        if (result.error) {
            fail(`failed to syntax-check ${filePath}: ${result.error.message}`);
        }

        if (result.status !== 0) {
            const output = (result.stderr || result.stdout || '').trim();
            console.error(output);
            fail(`syntax check failed for ${filePath}`);
        }
    }

    info(`JavaScript syntax verified for ${jsFiles.length} file(s)`);
}

function main() {
    info('Running unit tests');
    runOrFail(process.execPath, ['--test', 'tests/**/*.test.js']);

    info('Checking extension structure');
    validateStructure();
    validateMetadata();

    info('Checking GSettings schema');
    validateSchemaKeys();
    validateSchemaCompilation();

    info('Checking debug defaults');
    validateDebugDefault();

    info('Checking JavaScript syntax');
    validateSyntax();

    info('Validation completed successfully');
}

main();
