<?php
/**
 * Shared helpers for SQL Developer (/sqldev/). Requires config.inc.php first.
 */

if (!defined('SQLDEV_ROOT')) {
	define('SQLDEV_ROOT', __DIR__);
}

function sqldev_session_prefix() {
	global $CONFIG;
	return isset($CONFIG->sessionPrefix) ? $CONFIG->sessionPrefix : '_qsqs_';
}

function sqldev_is_logged_in() {
	global $CONFIG;
	$p = sqldev_session_prefix();
	return !empty($_SESSION[$p . 'a_user_id']) || !empty($_SESSION[$p . 'loginstatus']);
}

function sqldev_restricted_tables() {
	return [
		'admin_user_login_token',
		'qs_admin_debug_password',
		'qs_admin_user',
		'qs_easy_ecom_user',
		'qs_sub_user',
	];
}

function sqldev_query_references_restricted_table($sql) {
	$norm = strtolower($sql);
	$norm = str_replace('`', '', $norm);
	foreach (sqldev_restricted_tables() as $t) {
		if (preg_match('/\b' . preg_quote($t, '/') . '\b/', $norm)) {
			return true;
		}
	}
	return false;
}

function sqldev_normalize_for_analysis($sql) {
	$s = trim($sql);
	$s = preg_replace('/\/\*[\s\S]*?\*\//', ' ', $s);
	$lines = explode("\n", $s);
	$out = [];
	foreach ($lines as $line) {
		$cut = strpos($line, '--');
		if ($cut !== false) {
			$line = substr($line, 0, $cut);
		}
		$out[] = $line;
	}
	return trim(implode("\n", $out));
}

/**
 * Remove quoted string literals so keyword / table checks are not tripped by data in strings.
 */
function sqldev_strip_quoted_strings($sql) {
	$s = preg_replace("/'(?:[^'\\\\]|\\\\.|'')*'/s", ' ', $sql);
	$s = preg_replace('/"(?:[^"\\\\]|\\\\.)*"/s', ' ', $s);
	return $s;
}

/**
 * @return array{ok:bool, query?:string, error?:string}
 */
function sqldev_validate_select_query($query) {
	$q = rtrim(trim((string) $query), " \t\n\r\0\x0B;");
	if ($q === '') {
		return ['ok' => false, 'error' => 'Empty query.'];
	}
	if (strpos($q, ';') !== false) {
		return ['ok' => false, 'error' => 'Multiple statements are not allowed.'];
	}
	$check = sqldev_normalize_for_analysis($q);
	if (!preg_match('/^\s*select\s+/is', $check)) {
		return ['ok' => false, 'error' => 'Only SELECT queries are allowed.'];
	}
	$bare = sqldev_strip_quoted_strings($check);
	$forbidden = '\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|GRANT|REVOKE|CALL|EXECUTE|PREPARE|DEALLOCATE|LOCK\s+TABLES|UNLOCK\s+TABLES|LOAD\s+DATA|INTO\s+OUTFILE|INTO\s+DUMPFILE)\b';
	if (preg_match('/' . $forbidden . '/is', $bare)) {
		return ['ok' => false, 'error' => 'This query contains forbidden operations.'];
	}
	if (sqldev_query_references_restricted_table($bare)) {
		return ['ok' => false, 'error' => 'Error: Access to sensitive tables is restricted.'];
	}
	return ['ok' => true, 'query' => $q];
}

function sqldev_validate_table_identifier($name) {
	return is_string($name) && preg_match('/^[a-zA-Z0-9_]{1,64}$/', $name);
}
