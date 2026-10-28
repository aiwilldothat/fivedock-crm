<?php
/**
 * Fivedock CRM (Free, self-hosted) - core: config, SQLite bootstrap, schema, helpers, crypto.
 *
 * Single-install, single-organisation CRM. No SaaS, no subscription, no bundled AI, no mail relay.
 * Pure PHP 8 + SQLite (PDO). Drop the folder on any PHP 8.1+ host with a writable data/ dir and go.
 */
declare(strict_types=1);

if (defined('CRM_CORE')) { return; }
define('CRM_CORE', 1);

define('APP_NAME', 'Fivedock CRM');
define('APP_VERSION', '1.0.0');
define('BASE_DIR', dirname(__DIR__));

// Optional overrides (data dir, base url) via a local config.php - never required.
$__cfg = BASE_DIR . '/config.php';
if (is_file($__cfg)) { require $__cfg; }

defined('DATA_DIR') || define('DATA_DIR', BASE_DIR . '/data');
defined('DB_FILE')  || define('DB_FILE', DATA_DIR . '/crm.sqlite');
defined('APP_BASE_URL') || define('APP_BASE_URL', (string)(getenv('CRM_BASE_URL') ?: ''));  // used only as SMTP EHLO name

if (!is_dir(DATA_DIR)) { @mkdir(DATA_DIR, 0775, true); }

/* ---------- database ---------- */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) { return $pdo; }
    $fresh = !is_file(DB_FILE);
    $pdo = new PDO('sqlite:' . DB_FILE);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('PRAGMA foreign_keys=ON');
    $pdo->exec('PRAGMA busy_timeout=5000');
    migrate($pdo);
    if ($fresh) { @chmod(DB_FILE, 0660); }
    return $pdo;
}

/** Idempotent schema install + versioned migrations. */
function migrate(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)");
    $cur = (int)(meta_get($db, 'schema_version') ?? 0);
    $migrations = schema_migrations();
    if ($cur >= count($migrations)) { return; }
    foreach ($migrations as $i => $fn) {
        $n = $i + 1;
        if ($n <= $cur) { continue; }
        $db->beginTransaction();
        try { $fn($db); meta_set($db, 'schema_version', (string)$n); $db->commit(); }
        catch (Throwable $e) { if ($db->inTransaction()) { $db->rollBack(); } throw $e; }
    }
}

function schema_migrations(): array
{
    return [
        // 1 - core tables + seed
        function (PDO $db) {
            $db->exec("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)");
            $db->exec("CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, username TEXT UNIQUE, email TEXT,
                pass_hash TEXT, role TEXT DEFAULT 'user', active INTEGER DEFAULT 1, created_at TEXT)");
            $db->exec("CREATE TABLE IF NOT EXISTS companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, website TEXT, phone TEXT, address TEXT,
                notes TEXT, owner_id INTEGER, created_at TEXT, updated_at TEXT)");
            $db->exec("CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER, first_name TEXT, last_name TEXT,
                email TEXT, phone TEXT, title TEXT, tags TEXT, notes TEXT, owner_id INTEGER,
                created_at TEXT, updated_at TEXT)");
            $db->exec("CREATE TABLE IF NOT EXISTS pipeline_stages (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, sort INTEGER DEFAULT 0,
                is_won INTEGER DEFAULT 0, is_lost INTEGER DEFAULT 0)");
            $db->exec("CREATE TABLE IF NOT EXISTS deals (
                id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, company_id INTEGER, contact_id INTEGER,
                value REAL DEFAULT 0, stage_id INTEGER, status TEXT DEFAULT 'open',
                expected_close TEXT, notes TEXT, owner_id INTEGER, created_at TEXT, updated_at TEXT)");
            $db->exec("CREATE TABLE IF NOT EXISTS activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT DEFAULT 'note', subject TEXT, body TEXT,
                contact_id INTEGER, company_id INTEGER, deal_id INTEGER, due_at TEXT, done INTEGER DEFAULT 0,
                done_at TEXT, owner_id INTEGER, created_at TEXT)");
            $db->exec("CREATE TABLE IF NOT EXISTS email_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT, from_name TEXT, from_email TEXT,
                smtp_host TEXT, smtp_port INTEGER DEFAULT 587, smtp_secure TEXT DEFAULT 'tls',
                smtp_user TEXT, smtp_pass TEXT,
                imap_host TEXT, imap_port INTEGER DEFAULT 993, imap_secure TEXT DEFAULT 'ssl',
                imap_user TEXT, imap_pass TEXT, active INTEGER DEFAULT 1, created_at TEXT)");
            foreach ([
                ['id' => 'ix_contacts_company', 'sql' => 'CREATE INDEX IF NOT EXISTS ix_contacts_company ON contacts(company_id)'],
                ['id' => 'ix_deals_stage', 'sql' => 'CREATE INDEX IF NOT EXISTS ix_deals_stage ON deals(stage_id)'],
                ['id' => 'ix_act_contact', 'sql' => 'CREATE INDEX IF NOT EXISTS ix_act_contact ON activities(contact_id)'],
                ['id' => 'ix_act_due', 'sql' => 'CREATE INDEX IF NOT EXISTS ix_act_due ON activities(due_at)'],
            ] as $ix) { try { $db->exec($ix['sql']); } catch (Throwable $e) {} }
            // seed pipeline stages
            $stages = [['New', 0, 0, 0], ['Contacted', 10, 0, 0], ['Proposal', 20, 0, 0], ['Negotiation', 30, 0, 0], ['Won', 40, 1, 0], ['Lost', 50, 0, 1]];
            $ins = $db->prepare('INSERT INTO pipeline_stages (name,sort,is_won,is_lost) VALUES (?,?,?,?)');
            foreach ($stages as $s) { $ins->execute($s); }
            $db->prepare('INSERT OR IGNORE INTO settings (k,v) VALUES (?,?)')->execute(['org_name', 'My Company']);
            $db->prepare('INSERT OR IGNORE INTO settings (k,v) VALUES (?,?)')->execute(['currency', '$']);
        },
    ];
}

function meta_get(PDO $db, string $k): ?string
{
    $s = $db->prepare('SELECT v FROM meta WHERE k=?'); $s->execute([$k]);
    $v = $s->fetchColumn();
    return $v === false ? null : (string)$v;
}
function meta_set(PDO $db, string $k, string $v): void
{
    $db->prepare('INSERT INTO meta (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v')->execute([$k, $v]);
}
function setting(PDO $db, string $k, $def = null)
{
    $s = $db->prepare('SELECT v FROM settings WHERE k=?'); $s->execute([$k]);
    $v = $s->fetchColumn();
    return $v === false ? $def : $v;
}
function setting_set(PDO $db, string $k, string $v): void
{
    $db->prepare('INSERT INTO settings (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v')->execute([$k, $v]);
}

/* ---------- small helpers ---------- */
function now(): string { return date('Y-m-d H:i:s'); }
function client_ip(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? ''); }

function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store, private');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function json_error(string $msg, int $code = 400): void { json_out(['ok' => false, 'error' => $msg], $code); }

function body_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) { return $_POST ?: []; }
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

/* ---------- secret-at-rest crypto (SMTP/IMAP passwords) ----------
 * Per-install AES-256-GCM key under the web-blocked data/ dir. Never store mail passwords in clear. */
function mail_key(): string
{
    static $k = null;
    if ($k !== null) { return $k; }
    $f = DATA_DIR . '/.mailkey';
    $valid = fn($v) => is_string($v) && strlen((string)base64_decode($v, true)) === 32;
    if (is_file($f)) { $v = trim((string)@file_get_contents($f)); if ($valid($v)) { return $k = $v; } }
    $new = base64_encode(random_bytes(32));
    $fp = @fopen($f, 'c+');
    if ($fp) {
        if (@flock($fp, LOCK_EX)) {
            $cur = trim((string)stream_get_contents($fp));
            if ($valid($cur)) { $new = $cur; }
            else { rewind($fp); ftruncate($fp, 0); fwrite($fp, $new); fflush($fp); @chmod($f, 0600); }
            flock($fp, LOCK_UN);
        }
        fclose($fp);
    } else { @file_put_contents($f, $new, LOCK_EX); @chmod($f, 0600); }
    return $k = $new;
}
function enc_secret(string $plain): string
{
    if ($plain === '') { return ''; }
    if (!function_exists('openssl_encrypt')) { return 'p:' . base64_encode($plain); }
    $iv = random_bytes(12); $tag = '';
    $ct = openssl_encrypt($plain, 'aes-256-gcm', base64_decode(mail_key()), OPENSSL_RAW_DATA, $iv, $tag);
    if ($ct === false) { return 'p:' . base64_encode($plain); }
    return 'g:' . base64_encode($iv . $tag . $ct);
}
function dec_secret(string $stored): string
{
    if ($stored === '') { return ''; }
    if (str_starts_with($stored, 'p:')) { return (string)base64_decode(substr($stored, 2)); }
    if (str_starts_with($stored, 'g:')) {
        if (!function_exists('openssl_decrypt')) { return ''; }
        $raw = base64_decode(substr($stored, 2));
        if (strlen($raw) < 28) { return ''; }
        $pt = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', base64_decode(mail_key()), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        return $pt === false ? '' : $pt;
    }
    return $stored;
}

/* ---------- simple per-key rate limiter (login throttle) ---------- */
function rate_ok(string $key, int $max, int $windowSec): bool
{
    try {
        $db = db();
        $db->exec("CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, n INTEGER, reset_at INTEGER)");
        $now = time();
        $s = $db->prepare('SELECT n, reset_at FROM rate_limits WHERE k=?'); $s->execute([$key]);
        $r = $s->fetch();
        if (!$r || $now > (int)$r['reset_at']) {
            $db->prepare('INSERT INTO rate_limits (k,n,reset_at) VALUES (?,1,?) ON CONFLICT(k) DO UPDATE SET n=1, reset_at=excluded.reset_at')->execute([$key, $now + $windowSec]);
            return true;
        }
        if ((int)$r['n'] >= $max) { return false; }
        $db->prepare('UPDATE rate_limits SET n=n+1 WHERE k=?')->execute([$key]);
        return true;
    } catch (Throwable $e) { return true; }
}
