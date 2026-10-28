<?php
/**
 * Fivedock CRM (Free) - single entry point.
 * No ?r  -> serves the app shell (app.html).
 * ?r=... -> JSON API. Mutations are POST + CSRF; everything except setup/login requires sign-in.
 */
declare(strict_types=1);

require_once __DIR__ . '/lib/core.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/api.php';

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');

$route = (string)($_GET['r'] ?? '');

// Serve the SPA shell for a plain hit.
if ($route === '') {
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__ . '/app.html');
    exit;
}

session_boot();

try { $db = db(); }
catch (Throwable $e) { json_error('The database could not be opened. Make sure the data/ folder is writable.', 500); }

$me = current_user($db);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Mutating actions: must be POST and carry a valid CSRF token.
$POST_ACTIONS = ['setup', 'login', 'logout', 'save-contact', 'save-company', 'save-deal', 'deal-move',
    'save-activity', 'activity-toggle', 'save-email-account', 'test-email-account', 'send-email',
    'save-user', 'change-password', 'save-settings', 'delete'];
if (in_array($route, $POST_ACTIONS, true)) {
    if ($method !== 'POST') { json_error('POST required', 405); }
    csrf_check();
}

// Public (pre-auth) routes.
switch ($route) {
    case 'me':
        $setup = user_count($db) === 0;
        json_out([
            'ok' => true, 'app' => APP_NAME, 'version' => APP_VERSION,
            'setup_needed' => $setup,
            'user' => $me,
            'csrf' => csrf_token(),
            'settings' => ['org_name' => setting($db, 'org_name', 'My Company'), 'currency' => setting($db, 'currency', '$'), 'imap_available' => imap_available()],
        ]);
    case 'setup':   json_out(do_setup($db, body_json()));
    case 'login':   json_out(do_login($db, body_json()));
    case 'logout':  json_out(do_logout());
}

// Everything below requires a signed-in user.
if (!$me) { json_error('Not signed in', 401); }
$b = in_array($route, $POST_ACTIONS, true) ? body_json() : [];

switch ($route) {
    // reads
    case 'dashboard':      json_out(['ok' => true, 'data' => dashboard_data($db, $me)]);
    case 'contacts':       json_out(contacts_list($db, trim((string)($_GET['q'] ?? ''))));
    case 'contact':        json_out(contact_get($db, (int)($_GET['id'] ?? 0)));
    case 'companies':      json_out(companies_list($db, trim((string)($_GET['q'] ?? ''))));
    case 'company':        json_out(company_get($db, (int)($_GET['id'] ?? 0)));
    case 'pipeline':       json_out(pipeline_data($db));
    case 'stages':         json_out(stages_list($db));
    case 'activities':     json_out(activities_list($db, ['contact_id' => $_GET['contact_id'] ?? 0, 'deal_id' => $_GET['deal_id'] ?? 0, 'view' => $_GET['view'] ?? '']));
    case 'email-accounts': require_admin($db); json_out(email_accounts_list($db));
    case 'inbox':          json_out(inbox_data($db, $me, (int)($_GET['account_id'] ?? 0)));
    case 'users':          require_admin($db); json_out(['ok' => true, 'data' => $db->query('SELECT id,name,username,email,role,active,created_at FROM users ORDER BY id')->fetchAll()]);
    case 'export':         export_csv($db, (string)($_GET['type'] ?? 'contacts'));

    // writes
    case 'save-contact':       json_out(contact_save($db, $me, $b));
    case 'save-company':       json_out(company_save($db, $me, $b));
    case 'save-deal':          json_out(deal_save($db, $me, $b));
    case 'deal-move':          json_out(deal_move($db, $me, $b));
    case 'save-activity':      json_out(activity_save($db, $me, $b));
    case 'activity-toggle':    json_out(activity_toggle($db, $me, $b));
    case 'save-email-account': require_admin($db); json_out(email_account_save($db, $me, $b));
    case 'test-email-account': require_admin($db); json_out(email_account_test($db, $me, $b));
    case 'send-email':         json_out(send_email($db, $me, $b));
    case 'save-user':          require_admin($db); json_out(save_user($db, $me, $b));
    case 'change-password':    json_out(change_password($db, $me, $b));
    case 'save-settings':      require_admin($db); json_out(settings_save($db, $me, $b));
    case 'delete':             json_out(delete_record($db, $me, (string)($b['type'] ?? ''), (int)($b['id'] ?? 0)));

    default: json_error('Unknown action: ' . $route, 404);
}
