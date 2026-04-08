<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/__lib.includes/config.inc.php';
require_once __DIR__ . '/sqldev_common.php';

if (!sqldev_is_logged_in()) {
	http_response_code(401);
	header('Content-Type: text/plain; charset=utf-8');
	echo 'Not authenticated.';
	exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
	http_response_code(405);
	exit;
}

$query = isset($_POST['query']) ? (string) $_POST['query'] : '';
//print_r($query); exit;
$v = sqldev_validate_select_query($query);
if (!$v['ok']) {
	http_response_code(400);
	header('Content-Type: text/plain; charset=utf-8');
	echo $v['error'];
	exit;
}

global $CONFIG;
$link = $CONFIG->dbLink ?? null;
if (!$link instanceof mysqli) {
	http_response_code(500);
	exit;
}

mysqli_set_charset($link, 'utf8mb4');
$sql = $v['query'];
set_time_limit(300);
$res = mysqli_query($link, $sql);
if ($res === false) {
	http_response_code(400);
	header('Content-Type: text/plain; charset=utf-8');
	echo mysqli_error($link);
	exit;
}

$fname = 'sqldev_export_' . date('Y-m-d_His') . '.csv';
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $fname . '"');
header('X-Content-Type-Options: nosniff');

$out = fopen('php://output', 'w');
$fields = mysqli_fetch_fields($res);
$headers = [];
foreach ($fields as $f) {
	$headers[] = $f->name;
}
fputcsv($out, $headers);
while ($row = mysqli_fetch_assoc($res)) {
	$line = [];
	foreach ($headers as $h) {
		$line[] = isset($row[$h]) ? (string) $row[$h] : '';
	}
	fputcsv($out, $line);
}
mysqli_free_result($res);
fclose($out);
exit;
