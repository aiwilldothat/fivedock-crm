<?php
/** Fivedock CRM - core ERP: items/inventory, sales documents (quote/invoice), purchasing, suppliers. */
declare(strict_types=1);
require_once __DIR__ . '/core.php';

function es($v, int $max = 500): string { return mb_substr(trim((string)$v), 0, $max); }
function num($v): float { return round((float)$v, 2); }

/* ---------- items / inventory ---------- */
function items_list(PDO $db, string $q): array
{
    if ($q !== '') {
        $w = '%' . $q . '%';
        $st = $db->prepare("SELECT * FROM items WHERE code LIKE ? OR name LIKE ? OR description LIKE ? ORDER BY code,name LIMIT 500");
        $st->execute([$w, $w, $w]);
    } else { $st = $db->query("SELECT * FROM items ORDER BY active DESC, code, name LIMIT 500"); }
    return ['ok' => true, 'data' => $st->fetchAll()];
}
function item_get(PDO $db, int $id): array
{
    $s = $db->prepare('SELECT * FROM items WHERE id=?'); $s->execute([$id]); $it = $s->fetch();
    if (!$it) { return ['ok' => false, 'error' => 'Not found']; }
    $m = $db->prepare('SELECT m.*, u.name owner FROM stock_moves m LEFT JOIN users u ON u.id=m.user_id WHERE item_id=? ORDER BY m.id DESC LIMIT 50'); $m->execute([$id]);
    $it['moves'] = $m->fetchAll();
    return ['ok' => true, 'data' => $it];
}
function item_save(PDO $db, array $me, array $b): array
{
    $name = es($b['name'] ?? '', 160);
    if ($name === '') { return ['ok' => false, 'error' => 'Item name is required.']; }
    $code = es($b['code'] ?? '', 60) ?: ('IT' . substr((string)abs(crc32($name . microtime())), 0, 5));
    $type = in_array($b['type'] ?? 'stock', ['stock', 'service'], true) ? $b['type'] : 'stock';
    $vals = [$code, $name, es($b['description'] ?? '', 2000), $type, es($b['unit'] ?? 'ea', 20) ?: 'ea',
        max(0, num($b['price'] ?? 0)), max(0, num($b['cost'] ?? 0)), max(0, num($b['reorder_level'] ?? 0)),
        max(0, min(100, num($b['tax_rate'] ?? 0))), isset($b['active']) ? (!empty($b['active']) ? 1 : 0) : 1];
    $id = (int)($b['id'] ?? 0);
    if ($id > 0) {
        $db->prepare('UPDATE items SET code=?,name=?,description=?,type=?,unit=?,price=?,cost=?,reorder_level=?,tax_rate=?,active=?,updated_at=? WHERE id=?')
           ->execute([...$vals, now(), $id]);
    } else {
        // opening qty only on create (thereafter use stock adjustments)
        $openQty = max(0, num($b['qty'] ?? 0));
        $db->prepare('INSERT INTO items (code,name,description,type,unit,price,cost,reorder_level,tax_rate,active,qty,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
           ->execute([...$vals, $openQty, now(), now()]);
        $id = (int)$db->lastInsertId();
        if ($openQty != 0 && $type === 'stock') { $db->prepare('INSERT INTO stock_moves (item_id,qty_change,reason,ref,user_id,created_at) VALUES (?,?,?,?,?,?)')->execute([$id, $openQty, 'Opening balance', '', $me['id'], now()]); }
    }
    return ['ok' => true, 'id' => $id];
}
function stock_adjust(PDO $db, array $me, array $b): array
{
    $id = (int)($b['item_id'] ?? 0);
    $it = $db->prepare('SELECT type FROM items WHERE id=?'); $it->execute([$id]); $t = $it->fetchColumn();
    if (!$t) { return ['ok' => false, 'error' => 'Unknown item']; }
    if ($t === 'service') { return ['ok' => false, 'error' => 'Service items do not carry stock.']; }
    $delta = num($b['qty_change'] ?? 0);
    if ($delta == 0) { return ['ok' => false, 'error' => 'Enter a non-zero quantity (use a minus sign to reduce).']; }
    $reason = es($b['reason'] ?? 'Adjustment', 120) ?: 'Adjustment';
    $db->prepare('UPDATE items SET qty=qty+?, updated_at=? WHERE id=?')->execute([$delta, now(), $id]);
    $db->prepare('INSERT INTO stock_moves (item_id,qty_change,reason,ref,user_id,created_at) VALUES (?,?,?,?,?,?)')->execute([$id, $delta, $reason, '', $me['id'], now()]);
    return ['ok' => true];
}

/* ---------- suppliers ---------- */
function suppliers_list(PDO $db, string $q): array
{
    if ($q !== '') { $w = '%' . $q . '%'; $st = $db->prepare("SELECT * FROM suppliers WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? ORDER BY name LIMIT 500"); $st->execute([$w, $w, $w]); }
    else { $st = $db->query("SELECT * FROM suppliers ORDER BY name LIMIT 500"); }
    return ['ok' => true, 'data' => $st->fetchAll()];
}
function supplier_save(PDO $db, array $me, array $b): array
{
    $name = es($b['name'] ?? '', 160);
    if ($name === '') { return ['ok' => false, 'error' => 'Supplier name is required.']; }
    $vals = [$name, es($b['email'] ?? '', 200), es($b['phone'] ?? '', 60), es($b['address'] ?? '', 400), es($b['notes'] ?? '', 2000)];
    $id = (int)($b['id'] ?? 0);
    if ($id > 0) { $db->prepare('UPDATE suppliers SET name=?,email=?,phone=?,address=?,notes=?,updated_at=? WHERE id=?')->execute([...$vals, now(), $id]); }
    else { $db->prepare('INSERT INTO suppliers (name,email,phone,address,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')->execute([...$vals, now(), now()]); $id = (int)$db->lastInsertId(); }
    return ['ok' => true, 'id' => $id];
}

/* ---------- sales documents (quote / invoice) ---------- */
function sales_list(PDO $db, string $type): array
{
    $sql = "SELECT d.*, co.name company, c.first_name, c.last_name FROM sales_docs d
        LEFT JOIN companies co ON co.id=d.company_id LEFT JOIN contacts c ON c.id=d.contact_id";
    $args = [];
    if (in_array($type, ['quote', 'invoice'], true)) { $sql .= ' WHERE d.doc_type=?'; $args[] = $type; }
    $sql .= ' ORDER BY d.id DESC LIMIT 500';
    $st = $db->prepare($sql); $st->execute($args);
    return ['ok' => true, 'data' => $st->fetchAll()];
}
function sales_get(PDO $db, int $id): array
{
    $s = $db->prepare("SELECT d.*, co.name company, c.first_name, c.last_name, c.email contact_email
        FROM sales_docs d LEFT JOIN companies co ON co.id=d.company_id LEFT JOIN contacts c ON c.id=d.contact_id WHERE d.id=?");
    $s->execute([$id]); $d = $s->fetch();
    if (!$d) { return ['ok' => false, 'error' => 'Not found']; }
    $l = $db->prepare('SELECT * FROM sales_lines WHERE doc_id=? ORDER BY id'); $l->execute([$id]);
    $d['lines'] = $l->fetchAll();
    return ['ok' => true, 'data' => $d];
}
/** Compute totals from a lines array. Returns [lines(normalised), subtotal, tax, total]. */
function doc_totals(array $lines): array
{
    $out = []; $sub = 0; $tax = 0;
    foreach ($lines as $ln) {
        $desc = es($ln['description'] ?? '', 300);
        $qty = num($ln['qty'] ?? 0); $price = num($ln['price'] ?? 0); $rate = max(0, min(100, num($ln['tax_rate'] ?? 0)));
        if ($desc === '' && $qty == 0) { continue; }
        $lt = round($qty * $price, 2);
        $out[] = ['item_id' => (int)($ln['item_id'] ?? 0) ?: null, 'description' => $desc, 'qty' => $qty, 'price' => $price, 'tax_rate' => $rate, 'line_total' => $lt];
        $sub += $lt; $tax += round($lt * $rate / 100, 2);
    }
    return [$out, round($sub, 2), round($tax, 2), round($sub + $tax, 2)];
}
function sales_save(PDO $db, array $me, array $b): array
{
    $type = ($b['doc_type'] ?? 'invoice') === 'quote' ? 'quote' : 'invoice';
    [$lines, $sub, $tax, $total] = doc_totals($b['lines'] ?? []);
    $company = (int)($b['company_id'] ?? 0) ?: null;
    $contact = (int)($b['contact_id'] ?? 0) ?: null;
    $issue = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($b['issue_date'] ?? '')) ? $b['issue_date'] : date('Y-m-d');
    $due = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($b['due_date'] ?? '')) ? $b['due_date'] : null;
    $notes = es($b['notes'] ?? '', 4000);
    $status = in_array($b['status'] ?? 'draft', ['draft', 'sent', 'paid', 'cancelled', 'converted'], true) ? $b['status'] : 'draft';
    $id = (int)($b['id'] ?? 0);
    $db->beginTransaction();
    try {
        if ($id > 0) {
            $db->prepare('UPDATE sales_docs SET company_id=?,contact_id=?,status=?,issue_date=?,due_date=?,subtotal=?,tax=?,total=?,notes=?,updated_at=? WHERE id=?')
               ->execute([$company, $contact, $status, $issue, $due, $sub, $tax, $total, $notes, now(), $id]);
        } else {
            $number = next_number($db, $type === 'quote' ? 'Q' : 'INV');
            $db->prepare('INSERT INTO sales_docs (doc_type,number,company_id,contact_id,status,issue_date,due_date,subtotal,tax,total,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
               ->execute([$type, $number, $company, $contact, $status, $issue, $due, $sub, $tax, $total, $notes, now(), now()]);
            $id = (int)$db->lastInsertId();
        }
        $db->prepare('DELETE FROM sales_lines WHERE doc_id=?')->execute([$id]);
        $ins = $db->prepare('INSERT INTO sales_lines (doc_id,item_id,description,qty,price,tax_rate,line_total) VALUES (?,?,?,?,?,?,?)');
        foreach ($lines as $ln) { $ins->execute([$id, $ln['item_id'], $ln['description'], $ln['qty'], $ln['price'], $ln['tax_rate'], $ln['line_total']]); }
        $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) { $db->rollBack(); } return ['ok' => false, 'error' => 'Could not save the document.']; }
    return ['ok' => true, 'id' => $id];
}
function sales_convert(PDO $db, array $me, array $b): array
{
    $id = (int)($b['id'] ?? 0);
    $q = sales_get($db, $id); if (empty($q['ok'])) { return $q; }
    $d = $q['data'];
    if ($d['doc_type'] !== 'quote') { return ['ok' => false, 'error' => 'Only quotes can be converted.']; }
    $new = sales_save($db, $me, ['doc_type' => 'invoice', 'company_id' => $d['company_id'], 'contact_id' => $d['contact_id'],
        'issue_date' => date('Y-m-d'), 'notes' => $d['notes'], 'status' => 'draft',
        'lines' => array_map(fn($l) => ['item_id' => $l['item_id'], 'description' => $l['description'], 'qty' => $l['qty'], 'price' => $l['price'], 'tax_rate' => $l['tax_rate']], $d['lines'])]);
    if (!empty($new['ok'])) { $db->prepare("UPDATE sales_docs SET status='converted', updated_at=? WHERE id=?")->execute([now(), $id]); }
    return $new;
}
function sales_payment(PDO $db, array $me, array $b): array
{
    $id = (int)($b['id'] ?? 0);
    $amt = num($b['amount'] ?? 0);
    $s = $db->prepare('SELECT total,paid,doc_type FROM sales_docs WHERE id=?'); $s->execute([$id]); $d = $s->fetch();
    if (!$d || $d['doc_type'] !== 'invoice') { return ['ok' => false, 'error' => 'Payments apply to invoices only.']; }
    if ($amt <= 0) { return ['ok' => false, 'error' => 'Enter a payment amount.']; }
    $paid = round((float)$d['paid'] + $amt, 2);
    $status = $paid >= (float)$d['total'] && (float)$d['total'] > 0 ? 'paid' : 'sent';
    $db->prepare('UPDATE sales_docs SET paid=?, status=?, updated_at=? WHERE id=?')->execute([$paid, $status, now(), $id]);
    return ['ok' => true, 'paid' => $paid, 'status' => $status];
}
/** Toggle stock fulfilment for an invoice (decrement stock items once; reverse if turned off). */
function sales_fulfil(PDO $db, array $me, array $b): array
{
    $id = (int)($b['id'] ?? 0);
    $on = !empty($b['on']) ? 1 : 0;
    $s = $db->prepare('SELECT doc_type, number, fulfilled FROM sales_docs WHERE id=?'); $s->execute([$id]); $d = $s->fetch();
    if (!$d || $d['doc_type'] !== 'invoice') { return ['ok' => false, 'error' => 'Only invoices affect stock.']; }
    if ((int)$d['fulfilled'] === $on) { return ['ok' => true]; }
    $sign = $on ? -1 : 1;   // fulfil reduces stock; un-fulfil restores
    $db->beginTransaction();
    try {
        $l = $db->prepare("SELECT sl.qty, sl.item_id FROM sales_lines sl JOIN items i ON i.id=sl.item_id WHERE sl.doc_id=? AND i.type='stock' AND sl.item_id IS NOT NULL");
        $l->execute([$id]);
        foreach ($l->fetchAll() as $ln) {
            $db->prepare('UPDATE items SET qty=qty+?, updated_at=? WHERE id=?')->execute([$sign * (float)$ln['qty'], now(), $ln['item_id']]);
            $db->prepare('INSERT INTO stock_moves (item_id,qty_change,reason,ref,user_id,created_at) VALUES (?,?,?,?,?,?)')->execute([$ln['item_id'], $sign * (float)$ln['qty'], $on ? 'Invoice fulfilled' : 'Fulfilment reversed', $d['number'], $me['id'], now()]);
        }
        $db->prepare('UPDATE sales_docs SET fulfilled=?, updated_at=? WHERE id=?')->execute([$on, now(), $id]);
        $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) { $db->rollBack(); } return ['ok' => false, 'error' => 'Could not update stock.']; }
    return ['ok' => true];
}

/* ---------- purchasing ---------- */
function purchase_list(PDO $db): array
{
    $st = $db->query("SELECT p.*, s.name supplier FROM purchase_docs p LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.id DESC LIMIT 500");
    return ['ok' => true, 'data' => $st->fetchAll()];
}
function purchase_get(PDO $db, int $id): array
{
    $s = $db->prepare("SELECT p.*, s.name supplier, s.email supplier_email FROM purchase_docs p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?");
    $s->execute([$id]); $d = $s->fetch();
    if (!$d) { return ['ok' => false, 'error' => 'Not found']; }
    $l = $db->prepare('SELECT * FROM purchase_lines WHERE doc_id=? ORDER BY id'); $l->execute([$id]);
    $d['lines'] = $l->fetchAll();
    return ['ok' => true, 'data' => $d];
}
function purchase_save(PDO $db, array $me, array $b): array
{
    $supplier = (int)($b['supplier_id'] ?? 0) ?: null;
    $out = []; $sub = 0;
    foreach ($b['lines'] ?? [] as $ln) {
        $desc = es($ln['description'] ?? '', 300); $qty = num($ln['qty'] ?? 0); $price = num($ln['price'] ?? 0);
        if ($desc === '' && $qty == 0) { continue; }
        $lt = round($qty * $price, 2); $out[] = ['item_id' => (int)($ln['item_id'] ?? 0) ?: null, 'description' => $desc, 'qty' => $qty, 'price' => $price, 'line_total' => $lt]; $sub += $lt;
    }
    $sub = round($sub, 2); $notes = es($b['notes'] ?? '', 4000);
    $order = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($b['order_date'] ?? '')) ? $b['order_date'] : date('Y-m-d');
    $status = in_array($b['status'] ?? 'draft', ['draft', 'ordered', 'received', 'cancelled'], true) ? $b['status'] : 'draft';
    $id = (int)($b['id'] ?? 0);
    $db->beginTransaction();
    try {
        if ($id > 0) { $db->prepare('UPDATE purchase_docs SET supplier_id=?,status=?,order_date=?,subtotal=?,tax=?,total=?,notes=?,updated_at=? WHERE id=?')->execute([$supplier, $status, $order, $sub, 0, $sub, $notes, now(), $id]); }
        else {
            $number = next_number($db, 'PO');
            $db->prepare('INSERT INTO purchase_docs (number,supplier_id,status,order_date,subtotal,tax,total,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
               ->execute([$number, $supplier, $status, $order, $sub, 0, $sub, $notes, now(), now()]);
            $id = (int)$db->lastInsertId();
        }
        $db->prepare('DELETE FROM purchase_lines WHERE doc_id=?')->execute([$id]);
        $ins = $db->prepare('INSERT INTO purchase_lines (doc_id,item_id,description,qty,price,line_total) VALUES (?,?,?,?,?,?)');
        foreach ($out as $ln) { $ins->execute([$id, $ln['item_id'], $ln['description'], $ln['qty'], $ln['price'], $ln['line_total']]); }
        $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) { $db->rollBack(); } return ['ok' => false, 'error' => 'Could not save the purchase order.']; }
    return ['ok' => true, 'id' => $id];
}
function purchase_receive(PDO $db, array $me, array $b): array
{
    $id = (int)($b['id'] ?? 0);
    $on = !empty($b['on']) ? 1 : 0;
    $s = $db->prepare('SELECT number, received FROM purchase_docs WHERE id=?'); $s->execute([$id]); $d = $s->fetch();
    if (!$d) { return ['ok' => false, 'error' => 'Not found']; }
    if ((int)$d['received'] === $on) { return ['ok' => true]; }
    $sign = $on ? 1 : -1;   // receiving adds stock
    $db->beginTransaction();
    try {
        $l = $db->prepare("SELECT pl.qty, pl.item_id FROM purchase_lines pl JOIN items i ON i.id=pl.item_id WHERE pl.doc_id=? AND i.type='stock' AND pl.item_id IS NOT NULL");
        $l->execute([$id]);
        foreach ($l->fetchAll() as $ln) {
            $db->prepare('UPDATE items SET qty=qty+?, updated_at=? WHERE id=?')->execute([$sign * (float)$ln['qty'], now(), $ln['item_id']]);
            $db->prepare('INSERT INTO stock_moves (item_id,qty_change,reason,ref,user_id,created_at) VALUES (?,?,?,?,?,?)')->execute([$ln['item_id'], $sign * (float)$ln['qty'], $on ? 'PO received' : 'Receipt reversed', $d['number'], $me['id'], now()]);
        }
        $db->prepare('UPDATE purchase_docs SET received=?, status=?, updated_at=? WHERE id=?')->execute([$on, $on ? 'received' : 'ordered', now(), $id]);
        $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) { $db->rollBack(); } return ['ok' => false, 'error' => 'Could not receive the order.']; }
    return ['ok' => true];
}

/* ---------- ERP deletes (with stock reversal) ---------- */
function erp_delete(PDO $db, array $me, string $type, int $id): array
{
    if ($type === 'item') {
        $u = $db->prepare('SELECT COUNT(*) FROM sales_lines WHERE item_id=?'); $u->execute([$id]);
        $u2 = $db->prepare('SELECT COUNT(*) FROM purchase_lines WHERE item_id=?'); $u2->execute([$id]);
        if ((int)$u->fetchColumn() + (int)$u2->fetchColumn() > 0) { return ['ok' => false, 'error' => 'This item is used on documents and cannot be deleted. Mark it inactive instead.']; }
        $db->prepare('DELETE FROM items WHERE id=?')->execute([$id]);
        $db->prepare('DELETE FROM stock_moves WHERE item_id=?')->execute([$id]);
        return ['ok' => true];
    }
    if ($type === 'supplier') { $db->prepare('DELETE FROM suppliers WHERE id=?')->execute([$id]); $db->prepare('UPDATE purchase_docs SET supplier_id=NULL WHERE supplier_id=?')->execute([$id]); return ['ok' => true]; }
    if ($type === 'sales_doc') {
        $d = $db->prepare('SELECT fulfilled FROM sales_docs WHERE id=?'); $d->execute([$id]); $r = $d->fetch();
        if ($r && (int)$r['fulfilled'] === 1) { sales_fulfil($db, $me, ['id' => $id, 'on' => 0]); }  // restore stock
        $db->prepare('DELETE FROM sales_lines WHERE doc_id=?')->execute([$id]);
        $db->prepare('DELETE FROM sales_docs WHERE id=?')->execute([$id]);
        return ['ok' => true];
    }
    if ($type === 'purchase_doc') {
        $d = $db->prepare('SELECT received FROM purchase_docs WHERE id=?'); $d->execute([$id]); $r = $d->fetch();
        if ($r && (int)$r['received'] === 1) { purchase_receive($db, $me, ['id' => $id, 'on' => 0]); }
        $db->prepare('DELETE FROM purchase_lines WHERE doc_id=?')->execute([$id]);
        $db->prepare('DELETE FROM purchase_docs WHERE id=?')->execute([$id]);
        return ['ok' => true];
    }
    return ['ok' => false, 'error' => 'Unknown record type'];
}

/* ---------- ERP dashboard tiles ---------- */
function erp_dashboard(PDO $db): array
{
    return [
        'open_invoices' => (int)$db->query("SELECT COUNT(*) FROM sales_docs WHERE doc_type='invoice' AND status IN ('draft','sent')")->fetchColumn(),
        'unpaid_total' => (float)$db->query("SELECT COALESCE(SUM(total-paid),0) FROM sales_docs WHERE doc_type='invoice' AND status IN ('draft','sent')")->fetchColumn(),
        'revenue' => (float)$db->query("SELECT COALESCE(SUM(paid),0) FROM sales_docs WHERE doc_type='invoice'")->fetchColumn(),
        'items' => (int)$db->query("SELECT COUNT(*) FROM items WHERE active=1")->fetchColumn(),
        'low_stock' => (int)$db->query("SELECT COUNT(*) FROM items WHERE active=1 AND type='stock' AND reorder_level>0 AND qty<=reorder_level")->fetchColumn(),
        'stock_value' => (float)$db->query("SELECT COALESCE(SUM(qty*cost),0) FROM items WHERE type='stock'")->fetchColumn(),
    ];
}
