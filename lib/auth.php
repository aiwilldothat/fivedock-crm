<?php
/** Fivedock CRM - authentication, sessions, CSRF, user management. */
declare(strict_types=1);
require_once __DIR__ . '/core.php';

function session_boot(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) { return; }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? '') == 443);
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $https]);
    session_name('crmsess');
    session_start();
}

function user_count(PDO $db): int { return (int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn(); }

function current_user(PDO $db): ?array
{
    $uid = (int)($_SESSION['uid'] ?? 0);
    if ($uid <= 0) { return null; }
    $s = $db->prepare('SELECT id,name,username,email,role,active FROM users WHERE id=? AND active=1');
    $s->execute([$uid]);
    return $s->fetch() ?: null;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(16)); }
    return $_SESSION['csrf'];
}
function csrf_check(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['_csrf'] ?? '');
    if (!is_string($sent) || !hash_equals($_SESSION['csrf'] ?? '', $sent)) { json_error('Bad or missing CSRF token. Please reload.', 403); }
}

function require_login(PDO $db): array
{
    $u = current_user($db);
    if (!$u) { json_error('Not signed in', 401); }
    return $u;
}
function require_admin(PDO $db): array
{
    $u = require_login($db);
    if (($u['role'] ?? '') !== 'admin') { json_error('Admins only', 403); }
    return $u;
}

/** Create the very first admin (only when the install has no users yet). */
function do_setup(PDO $db, array $b): array
{
    if (user_count($db) > 0) { return ['ok' => false, 'error' => 'Setup has already been completed.']; }
    $name = trim((string)($b['name'] ?? ''));
    $username = trim((string)($b['username'] ?? ''));
    $email = trim((string)($b['email'] ?? ''));
    $pass = (string)($b['password'] ?? '');
    $org = trim((string)($b['org_name'] ?? '')) ?: 'My Company';
    if ($name === '' || $username === '') { return ['ok' => false, 'error' => 'Your name and a username are required.']; }
    if (strlen($pass) < 8) { return ['ok' => false, 'error' => 'Password must be at least 8 characters.']; }
    $db->prepare('INSERT INTO users (name,username,email,pass_hash,role,active,created_at) VALUES (?,?,?,?,?,1,?)')
       ->execute([$name, $username, $email, password_hash($pass, PASSWORD_DEFAULT), 'admin', now()]);
    setting_set($db, 'org_name', mb_substr($org, 0, 120));
    $_SESSION['uid'] = (int)$db->lastInsertId();
    return ['ok' => true];
}

function do_login(PDO $db, array $b): array
{
    $login = trim((string)($b['username'] ?? ''));
    if (!rate_ok('login:' . client_ip(), 20, 300)) { return ['ok' => false, 'error' => 'Too many attempts. Please wait a few minutes.']; }
    $s = $db->prepare('SELECT * FROM users WHERE active=1 AND (username=? OR email=?)');
    $s->execute([$login, $login]);
    $u = $s->fetch();
    if (!$u || !password_verify((string)($b['password'] ?? ''), (string)$u['pass_hash'])) {
        return ['ok' => false, 'error' => 'Invalid username or password.'];
    }
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    return ['ok' => true];
}

function do_logout(): array
{
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) { session_destroy(); }
    return ['ok' => true];
}

/** Admin: create or update a user. */
function save_user(PDO $db, array $me, array $b): array
{
    $id = (int)($b['id'] ?? 0);
    $name = trim((string)($b['name'] ?? ''));
    $username = trim((string)($b['username'] ?? ''));
    $email = trim((string)($b['email'] ?? ''));
    $role = in_array($b['role'] ?? 'user', ['admin', 'user'], true) ? $b['role'] : 'user';
    $active = isset($b['active']) ? (!empty($b['active']) ? 1 : 0) : 1;
    $pass = (string)($b['password'] ?? '');
    if ($name === '' || $username === '') { return ['ok' => false, 'error' => 'Name and username are required.']; }
    // uniqueness of username
    $dup = $db->prepare('SELECT id FROM users WHERE username=? AND id<>?'); $dup->execute([$username, $id]);
    if ($dup->fetch()) { return ['ok' => false, 'error' => 'That username is already taken.']; }
    if ($id > 0) {
        // do not let an admin lock everyone out: keep at least one active admin
        if (($role !== 'admin' || !$active) && (int)$db->query("SELECT COUNT(*) FROM users WHERE role='admin' AND active=1")->fetchColumn() <= 1) {
            $cur = $db->prepare('SELECT role,active FROM users WHERE id=?'); $cur->execute([$id]); $c = $cur->fetch();
            if ($c && $c['role'] === 'admin' && (int)$c['active'] === 1) { return ['ok' => false, 'error' => 'You cannot remove the last active admin.']; }
        }
        $db->prepare('UPDATE users SET name=?,username=?,email=?,role=?,active=? WHERE id=?')->execute([$name, $username, $email, $role, $active, $id]);
        if ($pass !== '') { if (strlen($pass) < 8) { return ['ok' => false, 'error' => 'Password must be at least 8 characters.']; } $db->prepare('UPDATE users SET pass_hash=? WHERE id=?')->execute([password_hash($pass, PASSWORD_DEFAULT), $id]); }
    } else {
        if (strlen($pass) < 8) { return ['ok' => false, 'error' => 'New users need a password of at least 8 characters.']; }
        $db->prepare('INSERT INTO users (name,username,email,pass_hash,role,active,created_at) VALUES (?,?,?,?,?,?,?)')
           ->execute([$name, $username, $email, password_hash($pass, PASSWORD_DEFAULT), $role, $active, now()]);
        $id = (int)$db->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}

/** Change own password (any role). */
function change_password(PDO $db, array $me, array $b): array
{
    $cur = (string)($b['current'] ?? '');
    $new = (string)($b['password'] ?? '');
    if (strlen($new) < 8) { return ['ok' => false, 'error' => 'New password must be at least 8 characters.']; }
    $s = $db->prepare('SELECT pass_hash FROM users WHERE id=?'); $s->execute([$me['id']]);
    if (!password_verify($cur, (string)$s->fetchColumn())) { return ['ok' => false, 'error' => 'Current password is incorrect.']; }
    $db->prepare('UPDATE users SET pass_hash=? WHERE id=?')->execute([password_hash($new, PASSWORD_DEFAULT), $me['id']]);
    return ['ok' => true];
}
