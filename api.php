<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/__lib.includes/config.inc.php';
require_once __DIR__ . '/sqldev_common.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if (!sqldev_is_logged_in()) {
	http_response_code(401);
	echo json_encode(['ok' => false, 'error' => 'Not authenticated.']);
	exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
	http_response_code(405);
	echo json_encode(['ok' => false, 'error' => 'Method not allowed.']);
	exit;
}

$raw = file_get_contents('php://input');
$input = json_decode($raw ?: 'null', true);
if (!is_array($input)) {
	$input = $_POST;
}

$action = isset($input['action']) ? (string) $input['action'] : '';

global $CONFIG;
$link = $CONFIG->dbLink ?? null;
if (!$link instanceof mysqli) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'error' => 'Database connection not available.']);
	exit;
}

mysqli_set_charset($link, 'utf8mb4');

if ($action === 'execute') {
	$query = isset($input['query']) ? (string) $input['query'] : '';
	$v = sqldev_validate_select_query($query);
	if (!$v['ok']) {
		echo json_encode(['ok' => false, 'error' => $v['error']]);
		exit;
	}
	
	$sql = $v['query'];
	$page = isset($input['page']) ? max(1, (int)$input['page']) : 1;
	$limit = 2000;
	$offset = ($page - 1) * $limit;

	// Get total row count
	$countSql = "SELECT COUNT(*) AS total FROM (" . $sql . ") AS sqldev_count";
	$resCount = mysqli_query($link, $countSql);
	$totalRows = 0;
	if ($resCount) {
		$row = mysqli_fetch_assoc($resCount);
		$totalRows = (int)($row['total'] ?? 0);
		mysqli_free_result($resCount);
	}

	// Append LIMIT if not already present
	$sql .= " LIMIT $offset, $limit";

	set_time_limit(360);
	$start = microtime(true);
	$res = mysqli_query($link, $sql);
	
	if ($res === false) {
		echo json_encode(['ok' => false, 'error' => mysqli_error($link)]);
		exit;
	}
	$fields = [];
	foreach (mysqli_fetch_fields($res) as $f) {
		$fields[] = $f->name;
	}
	$rows = [];
	while ($row = mysqli_fetch_assoc($res)) {
		$rows[] = $row;
	}
	mysqli_free_result($res);
	$ms = (int) round((microtime(true) - $start) * 1000);
	echo json_encode([
		'ok' => true,
		'columns' => $fields,
		'rows' => $rows,
		'rowCount' => count($rows),
		'totalCount' => $totalRows,
		'durationMs' => $ms,
	]);
	exit;
}

if ($action === 'structure') {
	$table = isset($input['table']) ? trim((string) $input['table']) : '';
	if (!sqldev_validate_table_identifier($table)) {
		echo json_encode(['ok' => false, 'error' => 'Invalid table name.']);
		exit;
	}
	if (sqldev_query_references_restricted_table('select * from ' . $table)) {
		echo json_encode(['ok' => false, 'error' => 'Error: Access to sensitive tables is restricted.']);
		exit;
	}
	$sql = 'SHOW FULL COLUMNS FROM `' . str_replace('`', '``', $table) . '`';
	set_time_limit(60);
	$res = mysqli_query($link, $sql);
	if ($res === false) {
		echo json_encode(['ok' => false, 'error' => mysqli_error($link)]);
		exit;
	}
	$out = [];
	while ($row = mysqli_fetch_assoc($res)) {
		$out[] = [
			'Field' => $row['Field'] ?? '',
			'Type' => $row['Type'] ?? '',
			'Null' => $row['Null'] ?? '',
			'Key' => $row['Key'] ?? '',
			'Default' => $row['Default'],
			'Extra' => $row['Extra'] ?? '',
		];
	}
	mysqli_free_result($res);
	echo json_encode(['ok' => true, 'columns' => $out]);
	exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Unknown action.']);
