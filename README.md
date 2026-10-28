# Fivedock CRM (Free)

A free, open-source, self-hosted CRM you can install in minutes. Pure PHP and SQLite - no
framework, no build step, no database server, no subscription, and no bundled AI or email.

Your data stays on your server. Email is sent only through your own mail accounts (bring your own
SMTP/IMAP). If you ever want AI features, you bring your own API key - nothing is phoned home.

## Features

- Contacts and companies with search, tags, notes, and a full activity timeline
- Deal pipeline with a drag-and-drop kanban board, values, and win/lost tracking
- Tasks and activities (calls, meetings, tasks, notes) with due dates and reminders
- Bring-your-own email: add your SMTP account(s) and send mail to contacts straight from the CRM
- Optional IMAP inbox to read replies (needs the PHP imap extension)
- Multiple users with admin and user roles
- CSV export for contacts, companies, and deals
- Self-installing SQLite database - no setup scripts to run

## Requirements

- PHP 8.1 or newer (with PDO SQLite and OpenSSL - both standard)
- Any web server (Apache, nginx, Caddy, or even PHP's built-in server)
- A writable `data/` folder
- Optional: the PHP `imap` extension, only if you want the inbox reader

## Install

1. Copy this `free/` folder onto your server (rename it to whatever you like, e.g. `crm`).
2. Make sure the `data/` folder is writable by the web server.
3. Point your browser at the folder. The first visit asks you to create the admin account.

That is it. The database and encryption key are created automatically inside `data/`.

### Apache

The included `.htaccess` sets the directory index and blocks the database and keys from the web.
Nothing else to do.

### nginx

nginx ignores `.htaccess`, so protect the private folders in your server block:

```nginx
location ~ ^/(data|lib)/ { deny all; return 404; }
location ~* \.(sqlite|mailkey)$ { deny all; return 404; }
location / {
    index app.html index.php;
    try_files $uri $uri/ =404;
}
location ~ \.php$ {
    include fastcgi_params;
    fastcgi_pass unix:/run/php/php8.1-fpm.sock;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
}
```

### Try it locally

```bash
php -S 127.0.0.1:8080 -t free
```

Then open http://127.0.0.1:8080/

## Email (bring your own)

Go to Settings -> Email accounts and add an account with your SMTP details (host, port, security,
username, password). Use the Test button to confirm it works. From then on, the Email button on a
contact sends through that account. Nothing is relayed through any third party.

Passwords for your mail accounts are encrypted at rest with a per-install key stored in `data/`.

## Security notes

- Keep the `data/` folder out of the web root if you can (see `config.sample.php` to move it).
- Serve the app over HTTPS in production.
- Only create admin accounts for people you trust - admins manage users and email accounts.

## Custom integration

Need this tailored to your business - extra modules, data import, single sign-on, or an
integration with your other tools? Custom integration and setup is available. See the project
home page for how to get in touch.

## License

MIT. See the LICENSE file. Fivedock CRM is provided as-is, free to use and modify.
