<?php
/**
 * Fivedock CRM - email. BYO only: mail is ONLY sent through accounts the user adds
 * (their own SMTP server). There is no built-in relay. IMAP inbox is optional and
 * used only to read replies (requires the PHP imap extension).
 */
declare(strict_types=1);
require_once __DIR__ . '/core.php';

/** Load an email account row with its passwords decrypted. */
function mail_account(PDO $db, int $id): ?array
{
    $s = $db->prepare('SELECT * FROM email_accounts WHERE id=? AND active=1'); $s->execute([$id]);
    $a = $s->fetch();
    if (!$a) { return null; }
    $a['smtp_pass'] = dec_secret((string)$a['smtp_pass']);
    $a['imap_pass'] = dec_secret((string)$a['imap_pass']);
    return $a;
}

/**
 * Send a plain-text email through a configured account's SMTP server.
 * Returns [ok=>bool, error=>string]. Header-injection safe.
 */
function smtp_send(array $acct, string $to, string $subject, string $body, ?string $replyTo = null): array
{
    $to = trim($to);
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) { return ['ok' => false, 'error' => 'The recipient email is not valid.']; }
    $host = (string)$acct['smtp_host'];
    $port = (int)$acct['smtp_port'];
    if ($host === '' || $port < 1 || $port > 65535) { return ['ok' => false, 'error' => 'This account has no valid SMTP host/port.']; }
    $secure = strtolower((string)($acct['smtp_secure'] ?? 'tls'));
    $user = (string)($acct['smtp_user'] ?? '');
    $pass = (string)($acct['smtp_pass'] ?? '');
    $fromEmail = (string)($acct['from_email'] ?? $user);
    $fromName = str_replace(["\r", "\n"], '', (string)($acct['from_name'] ?? ''));
    $subject = preg_replace('/[\r\n]+/', ' ', $subject);

    $prefix = $secure === 'ssl' ? 'ssl://' : '';
    $fp = @stream_socket_client($prefix . $host . ':' . $port, $errno, $errstr, 12);
    if (!$fp) { return ['ok' => false, 'error' => 'Could not connect to the mail server (' . ($errstr ?: ('error ' . $errno)) . ').']; }
    stream_set_timeout($fp, 12);
    $get = function () use ($fp) { $o = ''; while (($l = fgets($fp, 600)) !== false) { $o .= $l; if (strlen($l) < 4 || $l[3] === ' ') { break; } } return $o; };
    $put = function ($c) use ($fp) { fwrite($fp, $c . "\r\n"); };
    $ok  = fn($r, $c) => in_array(substr((string)$r, 0, 3), (array)$c, true);
    $ehlo = parse_url(APP_BASE_URL ?: ('http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost')), PHP_URL_HOST) ?: 'localhost';

    $fail = function (string $msg) use ($fp) { @fclose($fp); return ['ok' => false, 'error' => $msg]; };
    if (!$ok($get(), '220')) { return $fail('The mail server did not greet us correctly.'); }
    $put('EHLO ' . $ehlo); $get();
    if ($secure === 'tls') {
        $put('STARTTLS');
        if (!$ok($get(), '220')) { return $fail('The server refused STARTTLS. Try SSL or a different port.'); }
        if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) { return $fail('TLS negotiation failed.'); }
        $put('EHLO ' . $ehlo); $get();
    }
    if ($user !== '') {
        $put('AUTH LOGIN'); $get();
        $put(base64_encode($user)); $get();
        $put(base64_encode($pass));
        if (!$ok($get(), '235')) { return $fail('The mail server rejected the username or password.'); }
    }
    $put('MAIL FROM:<' . $fromEmail . '>'); if (!$ok($get(), '250')) { return $fail('The server rejected the sender address.'); }
    $put('RCPT TO:<' . $to . '>');          if (!$ok($get(), ['250', '251'])) { return $fail('The server rejected the recipient address.'); }
    $put('DATA');                           if (!$ok($get(), '354')) { return $fail('The server would not accept the message.'); }
    $fromHdr = ($fromName !== '' ? $fromName . ' ' : '') . '<' . $fromEmail . '>';
    $headers = 'From: ' . $fromHdr . "\r\nTo: " . $to . "\r\nSubject: " . $subject
             . "\r\nDate: " . date('r') . "\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8";
    if ($replyTo) { $headers .= "\r\nReply-To: " . preg_replace('/[\r\n]/', '', $replyTo); }
    $message = $headers . "\r\n\r\n" . $body;
    $message = str_replace("\n", "\r\n", str_replace("\r\n", "\n", $message));
    $message = preg_replace('/^\./m', '..', $message);
    $put($message);
    $put('.');
    $sent = $ok($get(), '250');
    $put('QUIT'); @fclose($fp);
    return $sent ? ['ok' => true] : ['ok' => false, 'error' => 'The server did not accept the message for delivery.'];
}

/** Is the PHP imap extension available for inbox reading? */
function imap_available(): bool { return function_exists('imap_open'); }

/**
 * Read the most recent inbox messages for an account via IMAP (read-only).
 * Returns [ok, messages[]] or [ok=>false, error]. Requires ext-imap.
 */
function imap_inbox(array $acct, int $limit = 25): array
{
    if (!imap_available()) { return ['ok' => false, 'error' => 'The PHP imap extension is not installed on this server, so the inbox cannot be read. Sending still works.']; }
    $host = (string)$acct['imap_host']; $port = (int)($acct['imap_port'] ?: 993);
    if ($host === '') { return ['ok' => false, 'error' => 'This account has no IMAP host set.']; }
    $secure = strtolower((string)($acct['imap_secure'] ?? 'ssl'));
    $flags = '/imap';
    $flags .= $secure === 'ssl' ? '/ssl' : ($secure === 'tls' ? '/tls' : '/notls');
    $flags .= '/novalidate-cert';
    $mbox = '{' . $host . ':' . $port . $flags . '}INBOX';
    $mb = @imap_open($mbox, (string)$acct['imap_user'], (string)$acct['imap_pass'], 0, 1);
    if (!$mb) { return ['ok' => false, 'error' => 'IMAP login failed: ' . (string)imap_last_error()]; }
    $total = (int)imap_num_msg($mb);
    $msgs = [];
    $from = max(1, $total - $limit + 1);
    for ($i = $total; $i >= $from; $i--) {
        $o = @imap_headerinfo($mb, $i);
        if (!$o) { continue; }
        $fromAddr = '';
        if (!empty($o->from[0])) { $fromAddr = ($o->from[0]->mailbox ?? '') . '@' . ($o->from[0]->host ?? ''); }
        $msgs[] = [
            'subject' => imap_safe_mime((string)($o->subject ?? '(no subject)')),
            'from' => imap_safe_mime((string)($o->fromaddress ?? $fromAddr)),
            'from_email' => $fromAddr,
            'date' => (string)($o->date ?? ''),
            'seen' => isset($o->Unseen) ? ($o->Unseen !== 'U') : true,
        ];
    }
    imap_close($mb);
    return ['ok' => true, 'messages' => $msgs];
}
function imap_safe_mime(string $s): string
{
    if (!function_exists('imap_mime_header_decode')) { return $s; }
    $out = '';
    foreach (imap_mime_header_decode($s) as $p) {
        $cs = strtoupper((string)($p->charset ?? 'default'));
        $out .= ($cs === 'DEFAULT' || $cs === 'UTF-8') ? $p->text : @mb_convert_encoding($p->text, 'UTF-8', $cs);
    }
    return $out;
}
