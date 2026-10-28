<?php
/** Fivedock CRM - API handlers (contacts, companies, deals, activities, email accounts, dashboard). */
declare(strict_types=1);
require_once __DIR__ . '/core.php';
require_once __DIR__ . '/mail.php';

function s($v, int $max = 500): string { return mb_substr(trim((string)$v), 0, $max); }

/* ---------- dashboard ---------- */
function dashboard_data(PDO $db, array $me): array
{
    $one = fn($sql) => (int)$db->query($sql)->fetchColumn();
    $openVal = (float)$db->query("SELECT COALESCE(SUM(value),0) FROM deals WHERE status='open'")->fetchColumn();
    $today = date('Y-m-d');
    $tasksDue = (int)$db->prepare("SELECT COUNT(*) FROM activities WHERE done=0 AND due_at IS NOT NULL AND due_at<=?")->execute([$today . ' 23:59:59']);
    $td = $db->prepare("SELECT COUNT(*) FROM activities WHERE done=0 AND due_at IS NOT NULL AND date(due_at)<=date('now')"); $td->execute();
    $recent = $db->query("SELECT a.*, c.first_name, c.last_name FROM activities a
        LEFT JOIN contacts c ON c.id=a.contact_id ORDER BY a.id DESC LIMIT 8")->fetchAll();
    $stageVals = $db->query("SELECT st.name, COALESCE(SUM(d.value),0) val, COUNT(d.id) n
        FROM pipeline_stages st LEFT JOIN deals d ON d.stage_id=st.id AND d.status='open'
        WHERE st.is_won=0 AND st.is_lost=0 GROUP BY st.id ORDER BY st.sort")->fetchAll();
    return [
        'contacts' => $one('SELECT COUNT(*) FROM contacts'),
        'companies' => $one('SELECT COUNT(*) FROM companies'),
        'open_deals' => $one("SELECT COUNT(*) FROM deals WHERE status='open'"),
        'pipeline_value' => $openVal,
        'won_value' => (float)$db->query("SELECT COALESCE(SUM(value),0) FROM deals WHERE status='won'")->fetchColumn(),
        'tasks_due' => (int)$td->fetchColumn(),
        'recent' => $recent,
        'by_stage' => $stageVals,
    ];
}

/* ---------- companies ---------- */
function companies_list(PDO $db, string $q): array
{
    if ($q !== '') {
        $st = $db->prepare("SELECT co.*, (SELECT COUNT(*) FROM contacts c WHERE c.company_id=co.id) contacts
            FROM companies co WHERE co.name LIKE ? OR co.phone LIKE ? OR co.website LIKE ? ORDER BY co.name LIMIT 500");
        $w = '%' . $q . '%'; $st->execute([$w, $w, $w]);
    } else {
        $st = $db->query("SELECT co.*, (SELECT COUNT(*) FROM contacts c WHERE c.company_id=co.id) contacts FROM companies co ORDER BY co.name LIMIT 500");
    }
    return ['ok' => true, 'data' => $st->fetchAll()];
}
function company_get(PDO $db, int $id): array
{
    $s = $db->prepare('SELECT * FROM companies WHERE id=?'); $s->execute([$id]); $c = $s->fetch();
    if (!$c) { return ['ok' => false, 'error' => 'Not found']; }
    $ct = $db->prepare('SELECT id,first_name,last_name,email,phone,title FROM contacts WHERE company_id=? ORDER BY first_name,last_name'); $ct->execute([$id]);
    $c['contacts'] = $ct->fetchAll();
    $dl = $db->prepare("SELECT d.*, st.name stage FROM deals d LEFT JOIN pipeline_stages st ON st.id=d.stage_id WHERE d.company_id=? ORDER BY d.id DESC"); $dl->execute([$id]);
    $c['deals'] = $dl->fetchAll();
    return ['ok' => true, 'data' => $c];
}
function company_save(PDO $db, array $me, array $b): array
{
    $name = s($b['name'] ?? '', 160);
    if ($name === '') { return ['ok' => false, 'error' => 'Company name is required.']; }
    $id = (int)($b['id'] ?? 0);
    $f = [s($b['website'] ?? '', 200), s($b['phone'] ?? '', 60), s($b['address'] ?? '', 400), s($b['notes'] ?? '', 4000)];
    if ($id > 0) {
        $db->prepare('UPDATE companies SET name=?,website=?,phone=?,address=?,notes=?,updated_at=? WHERE id=?')
           ->execute([$name, $f[0], $f[1], $f[2], $f[3], now(), $id]);
    } else {
        $db->prepare('INSERT INTO companies (name,website,phone,address,notes,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
           ->execute([$name, $f[0], $f[1], $f[2], $f[3], $me['id'], now(), now()]);
        $id = (int)$db->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}

/* ---------- contacts ---------- */
function contacts_list(PDO $db, string $q): array
{
    $base = "SELECT c.*, co.name company FROM contacts c LEFT JOIN companies co ON co.id=c.company_id ";
    if ($q !== '') {
        $w = '%' . $q . '%';
        $st = $db->prepare($base . "WHERE c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR co.name LIKE ? OR c.tags LIKE ? ORDER BY c.first_name,c.last_name LIMIT 500");
        $st->execute([$w, $w, $w, $w, $w, $w]);
    } else {
        $st = $db->query($base . "ORDER BY c.updated_at DESC, c.id DESC LIMIT 500");
    }
    return ['ok' => true, 'data' => $st->fetchAll()];
}
function contact_get(PDO $db, int $id): array
{
    $s = $db->prepare("SELECT c.*, co.name company FROM contacts c LEFT JOIN companies co ON co.id=c.company_id WHERE c.id=?");
    $s->execute([$id]); $c = $s->fetch();
    if (!$c) { return ['ok' => false, 'error' => 'Not found']; }
    $c['timeline'] = contact_timeline($db, $id);
    $dl = $db->prepare("SELECT d.*, st.name stage FROM deals d LEFT JOIN pipeline_stages st ON st.id=d.stage_id WHERE d.contact_id=? ORDER BY d.id DESC"); $dl->execute([$id]);
    $c['deals'] = $dl->fetchAll();
    return ['ok' => true, 'data' => $c];
}
function contact_timeline(PDO $db, int $id): array
{
    $s = $db->prepare("SELECT a.*, u.name owner FROM activities a LEFT JOIN users u ON u.id=a.owner_id WHERE a.contact_id=? ORDER BY COALESCE(a.due_at,a.created_at) DESC, a.id DESC LIMIT 100");
    $s->execute([$id]);
    return $s->fetchAll();
}
function contact_save(PDO $db, array $me, array $b): array
{
    $fn = s($b['first_name'] ?? '', 80); $ln = s($b['last_name'] ?? '', 80);
    if ($fn === '' && $ln === '') { return ['ok' => false, 'error' => 'A first or last name is required.']; }
    $email = s($b['email'] ?? '', 200);
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) { return ['ok' => false, 'error' => 'That email address is not valid.']; }
    $companyId = (int)($b['company_id'] ?? 0) ?: null;
    $vals = [$companyId, $fn, $ln, $email, s($b['phone'] ?? '', 60), s($b['title'] ?? '', 120), s($b['tags'] ?? '', 200), s($b['notes'] ?? '', 4000)];
    $id = (int)($b['id'] ?? 0);
    if ($id > 0) {
        $db->prepare('UPDATE contacts SET company_id=?,first_name=?,last_name=?,email=?,phone=?,title=?,tags=?,notes=?,updated_at=? WHERE id=?')
           ->execute([...$vals, now(), $id]);
    } else {
        $db->prepare('INSERT INTO contacts (company_id,first_name,last_name,email,phone,title,tags,notes,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
           ->execute([...$vals, $me['id'], now(), now()]);
        $id = (int)$db->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}

/* ---------- deals / pipeline ---------- */
function stages_list(PDO $db): array { return ['ok' => true, 'data' => $db->query('SELECT * FROM pipeline_stages ORDER BY sort,id')->fetchAll()]; }

function pipeline_data(PDO $db): array
{
    $stages = $db->query('SELECT * FROM pipeline_stages ORDER BY sort,id')->fetchAll();
    $deals = $db->query("SELECT d.*, co.name company, c.first_name, c.last_name
        FROM deals d LEFT JOIN companies co ON co.id=d.company_id LEFT JOIN contacts c ON c.id=d.contact_id
        WHERE d.status='open' ORDER BY d.updated_at DESC, d.id DESC")->fetchAll();
    $by = [];
    foreach ($stages as $st) { $by[$st['id']] = []; }
    foreach ($deals as $d) { $by[$d['stage_id']][] = $d; }
    return ['ok' => true, 'stages' => $stages, 'deals' => $by];
}
function deal_save(PDO $db, array $me, array $b): array
{
    $title = s($b['title'] ?? '', 200);
    if ($title === '') { return ['ok' => false, 'error' => 'A deal title is required.']; }
    $stageId = (int)($b['stage_id'] ?? 0);
    if ($stageId <= 0) { $stageId = (int)$db->query('SELECT id FROM pipeline_stages ORDER BY sort,id LIMIT 1')->fetchColumn(); }
    $st = $db->prepare('SELECT is_won,is_lost FROM pipeline_stages WHERE id=?'); $st->execute([$stageId]); $sf = $st->fetch() ?: ['is_won' => 0, 'is_lost' => 0];
    $status = $sf['is_won'] ? 'won' : ($sf['is_lost'] ? 'lost' : 'open');
    $vals = [$title, (int)($b['company_id'] ?? 0) ?: null, (int)($b['contact_id'] ?? 0) ?: null,
        max(0, (float)($b['value'] ?? 0)), $stageId, $status,
        (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($b['expected_close'] ?? '')) ? $b['expected_close'] : null), s($b['notes'] ?? '', 4000)];
    $id = (int)($b['id'] ?? 0);
    if ($id > 0) {
        $db->prepare('UPDATE deals SET title=?,company_id=?,contact_id=?,value=?,stage_id=?,status=?,expected_close=?,notes=?,updated_at=? WHERE id=?')
           ->execute([...$vals, now(), $id]);
    } else {
        $db->prepare('INSERT INTO deals (title,company_id,contact_id,value,stage_id,status,expected_close,notes,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
           ->execute([...$vals, $me['id'], now(), now()]);
        $id = (int)$db->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}
function deal_move(PDO $db, array $me, array $b): array
{
    $id = (int)($b['id'] ?? 0); $stageId = (int)($b['stage_id'] ?? 0);
    $st = $db->prepare('SELECT is_won,is_lost FROM pipeline_stages WHERE id=?'); $st->execute([$stageId]); $sf = $st->fetch();
    if (!$sf) { return ['ok' => false, 'error' => 'Unknown stage']; }
    $status = $sf['is_won'] ? 'won' : ($sf['is_lost'] ? 'lost' : 'open');
    $db->prepare('UPDATE deals SET stage_id=?,status=?,updated_at=? WHERE id=?')->execute([$stageId, $status, now(), $id]);
    return ['ok' => true];
}

/* ---------- activities / tasks ---------- */
function activities_list(PDO $db, array $f): array
{
    $where = []; $args = [];
    if (!empty($f['contact_id'])) { $where[] = 'a.contact_id=?'; $args[] = (int)$f['contact_id']; }
    if (!empty($f['deal_id'])) { $where[] = 'a.deal_id=?'; $args[] = (int)$f['deal_id']; }
    if (($f['view'] ?? '') === 'open') { $where[] = 'a.done=0'; }
    $sql = "SELECT a.*, c.first_name, c.last_name, u.name owner FROM activities a
        LEFT JOIN contacts c ON c.id=a.contact_id LEFT JOIN users u ON u.id=a.owner_id";
    if ($where) { $sql .= ' WHERE ' . implode(' AND ', $where); }
    $sql .= " ORDER BY a.done ASC, COALESCE(a.due_at, a.created_at) ASC, a.id DESC LIMIT 500";
    $st = $db->prepare($sql); $st->execute($args);
    return ['ok' => true, 'data' => $st->fetchAll()];
}
function activity_save(PDO $db, array $me, array $b): array
{
    $type = in_array($b['type'] ?? 'task', ['call', 'meeting', 'task', 'note', 'email'], true) ? $b['type'] : 'task';
    $subject = s($b['subject'] ?? '', 200);
    if ($subject === '') { return ['ok' => false, 'error' => 'A subject is required.']; }
    $due = (preg_match('/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?/', (string)($b['due_at'] ?? '')) ? str_replace('T', ' ', (string)$b['due_at']) : null);
    $vals = [$type, $subject, s($b['body'] ?? '', 8000), (int)($b['contact_id'] ?? 0) ?: null, (int)($b['company_id'] ?? 0) ?: null, (int)($b['deal_id'] ?? 0) ?: null, $due, !empty($b['done']) ? 1 : 0];
    $id = (int)($b['id'] ?? 0);
    if ($id > 0) {
        $db->prepare('UPDATE activities SET type=?,subject=?,body=?,contact_id=?,company_id=?,deal_id=?,due_at=?,done=? WHERE id=?')->execute([...$vals, $id]);
    } else {
        $db->prepare('INSERT INTO activities (type,subject,body,contact_id,company_id,deal_id,due_at,done,owner_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
           ->execute([...$vals, $me['id'], now()]);
        $id = (int)$db->lastInsertId();
    }
    return ['ok' => true, 'id' => $id];
}
function activity_toggle(PDO $db, array $me, array $b): array
{
    $id = (int)($b['id'] ?? 0);
    $done = !empty($b['done']) ? 1 : 0;
    $db->prepare('UPDATE activities SET done=?, done_at=? WHERE id=?')->execute([$done, $done ? now() : null, $id]);
    return ['ok' => true];
}

/* ---------- email accounts (BYO) ---------- */
function email_accounts_list(PDO $db): array
{
    $rows = $db->query('SELECT id,label,from_name,from_email,smtp_host,smtp_port,smtp_secure,smtp_user,imap_host,imap_port,imap_secure,imap_user,active FROM email_accounts ORDER BY id')->fetchAll();
    foreach ($rows as &$r) { $r['smtp_pass_set'] = true; $r['imap_pass_set'] = true; }  // never return the secret
    return ['ok' => true, 'data' => $rows, 'imap_available' => imap_available()];
}
function email_account_save(PDO $db, array $me, array $b): array
{
    $label = s($b['label'] ?? '', 120);
    $fromEmail = s($b['from_email'] ?? '', 200);
    if ($fromEmail === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) { return ['ok' => false, 'error' => 'A valid From email is required.']; }
    if ($label === '') { $label = $fromEmail; }
    $smtpHost = s($b['smtp_host'] ?? '', 200);
    if ($smtpHost === '') { return ['ok' => false, 'error' => 'An SMTP host is required to send mail.']; }
    $smtpPort = (int)($b['smtp_port'] ?? 587); if ($smtpPort < 1 || $smtpPort > 65535) { $smtpPort = 587; }
    $smtpSecure = in_array($b['smtp_secure'] ?? 'tls', ['tls', 'ssl', 'none'], true) ? $b['smtp_secure'] : 'tls';
    $imapPort = (int)($b['imap_port'] ?? 993); if ($imapPort < 1 || $imapPort > 65535) { $imapPort = 993; }
    $imapSecure = in_array($b['imap_secure'] ?? 'ssl', ['ssl', 'tls', 'none'], true) ? $b['imap_secure'] : 'ssl';
    $active = isset($b['active']) ? (!empty($b['active']) ? 1 : 0) : 1;
    $id = (int)($b['id'] ?? 0);
    $common = [$label, s($b['from_name'] ?? '', 120), $fromEmail, $smtpHost, $smtpPort, $smtpSecure, s($b['smtp_user'] ?? '', 200),
        s($b['imap_host'] ?? '', 200), $imapPort, $imapSecure, s($b['imap_user'] ?? '', 200), $active];
    if ($id > 0) {
        $db->prepare('UPDATE email_accounts SET label=?,from_name=?,from_email=?,smtp_host=?,smtp_port=?,smtp_secure=?,smtp_user=?,imap_host=?,imap_port=?,imap_secure=?,imap_user=?,active=? WHERE id=?')
           ->execute([...$common, $id]);
    } else {
        $db->prepare('INSERT INTO email_accounts (label,from_name,from_email,smtp_host,smtp_port,smtp_secure,smtp_user,imap_host,imap_port,imap_secure,imap_user,active,smtp_pass,imap_pass,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
           ->execute([...$common, '', '', now()]);
        $id = (int)$db->lastInsertId();
    }
    // passwords only updated when a new value is supplied (so edits don't wipe them)
    if (($b['smtp_pass'] ?? '') !== '') { $db->prepare('UPDATE email_accounts SET smtp_pass=? WHERE id=?')->execute([enc_secret((string)$b['smtp_pass']), $id]); }
    if (($b['imap_pass'] ?? '') !== '') { $db->prepare('UPDATE email_accounts SET imap_pass=? WHERE id=?')->execute([enc_secret((string)$b['imap_pass']), $id]); }
    return ['ok' => true, 'id' => $id];
}
function email_account_test(PDO $db, array $me, array $b): array
{
    $id = (int)($b['id'] ?? 0);
    $acct = mail_account($db, $id);
    if (!$acct) { return ['ok' => false, 'error' => 'Save the account first, then test.']; }
    $to = s($b['to'] ?? $me['email'] ?? '', 200) ?: (string)$acct['from_email'];
    $r = smtp_send($acct, $to, 'Fivedock CRM test email', "This is a test from Fivedock CRM.\n\nIf you received this, sending from \"" . $acct['label'] . "\" works.", null);
    return $r['ok'] ? ['ok' => true, 'message' => 'Test email sent to ' . $to . '. Check the inbox (and spam).'] : $r;
}

/* ---------- send email to a contact (from a BYO account) + log ---------- */
function send_email(PDO $db, array $me, array $b): array
{
    $acct = mail_account($db, (int)($b['account_id'] ?? 0));
    if (!$acct) { return ['ok' => false, 'error' => 'Pick an email account to send from (add one in Settings).']; }
    $to = s($b['to'] ?? '', 200);
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) { return ['ok' => false, 'error' => 'The recipient email is not valid.']; }
    $subject = s($b['subject'] ?? '', 200);
    $body = (string)($b['body'] ?? '');
    if ($subject === '' || trim($body) === '') { return ['ok' => false, 'error' => 'A subject and a message are required.']; }
    $r = smtp_send($acct, $to, $subject, $body, (string)$acct['from_email']);
    if (empty($r['ok'])) { return $r; }
    // log as an activity on the contact
    $cid = (int)($b['contact_id'] ?? 0) ?: null;
    $db->prepare('INSERT INTO activities (type,subject,body,contact_id,deal_id,done,done_at,owner_id,created_at) VALUES (?,?,?,?,?,1,?,?,?)')
       ->execute(['email', 'Email: ' . $subject, "To: " . $to . "\n\n" . $body, $cid, (int)($b['deal_id'] ?? 0) ?: null, now(), $me['id'], now()]);
    return ['ok' => true, 'message' => 'Email sent to ' . $to . '.'];
}
function inbox_data(PDO $db, array $me, int $accountId): array
{
    $acct = mail_account($db, $accountId);
    if (!$acct) { return ['ok' => false, 'error' => 'Unknown email account.']; }
    return imap_inbox($acct, 25);
}

/* ---------- delete (admin or owner) ---------- */
function delete_record(PDO $db, array $me, string $type, int $id): array
{
    $map = ['contact' => 'contacts', 'company' => 'companies', 'deal' => 'deals', 'activity' => 'activities', 'email_account' => 'email_accounts', 'user' => 'users'];
    if (!isset($map[$type])) { return ['ok' => false, 'error' => 'Unknown record type']; }
    $table = $map[$type];
    if (in_array($type, ['email_account', 'user'], true) && ($me['role'] ?? '') !== 'admin') { return ['ok' => false, 'error' => 'Admins only']; }
    if ($type === 'user') {
        if ($id === (int)$me['id']) { return ['ok' => false, 'error' => 'You cannot delete your own account.']; }
        $cur = $db->prepare('SELECT role,active FROM users WHERE id=?'); $cur->execute([$id]); $c = $cur->fetch();
        if ($c && $c['role'] === 'admin' && (int)$db->query("SELECT COUNT(*) FROM users WHERE role='admin' AND active=1")->fetchColumn() <= 1) { return ['ok' => false, 'error' => 'You cannot delete the last admin.']; }
    }
    $db->prepare("DELETE FROM {$table} WHERE id=?")->execute([$id]);
    // tidy references on contacts/companies/deletes
    if ($type === 'company') { $db->prepare('UPDATE contacts SET company_id=NULL WHERE company_id=?')->execute([$id]); $db->prepare('UPDATE deals SET company_id=NULL WHERE company_id=?')->execute([$id]); }
    if ($type === 'contact') { $db->prepare('UPDATE deals SET contact_id=NULL WHERE contact_id=?')->execute([$id]); $db->prepare('DELETE FROM activities WHERE contact_id=?')->execute([$id]); }
    return ['ok' => true];
}

/* ---------- CSV export ---------- */
function export_csv(PDO $db, string $type): void
{
    $cols = []; $rows = [];
    if ($type === 'contacts') {
        $cols = ['First name', 'Last name', 'Email', 'Phone', 'Title', 'Company', 'Tags'];
        $rows = $db->query("SELECT c.first_name,c.last_name,c.email,c.phone,c.title,co.name,c.tags FROM contacts c LEFT JOIN companies co ON co.id=c.company_id ORDER BY c.first_name")->fetchAll(PDO::FETCH_NUM);
    } elseif ($type === 'companies') {
        $cols = ['Name', 'Website', 'Phone', 'Address'];
        $rows = $db->query("SELECT name,website,phone,address FROM companies ORDER BY name")->fetchAll(PDO::FETCH_NUM);
    } elseif ($type === 'deals') {
        $cols = ['Title', 'Company', 'Contact', 'Value', 'Stage', 'Status', 'Expected close'];
        $rows = $db->query("SELECT d.title,co.name,(c.first_name||' '||c.last_name),d.value,st.name,d.status,d.expected_close
            FROM deals d LEFT JOIN companies co ON co.id=d.company_id LEFT JOIN contacts c ON c.id=d.contact_id LEFT JOIN pipeline_stages st ON st.id=d.stage_id ORDER BY d.id DESC")->fetchAll(PDO::FETCH_NUM);
    } else { json_error('Unknown export', 404); }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $type . '-' . date('Ymd') . '.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, $cols);
    foreach ($rows as $r) { fputcsv($out, $r); }
    fclose($out);
    exit;
}

/* ---------- settings ---------- */
function settings_save(PDO $db, array $me, array $b): array
{
    if (isset($b['org_name'])) { setting_set($db, 'org_name', s($b['org_name'], 120)); }
    if (isset($b['currency'])) { setting_set($db, 'currency', s($b['currency'], 6) ?: '$'); }
    return ['ok' => true];
}
