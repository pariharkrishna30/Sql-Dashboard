<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/__lib.includes/config.inc.php';
require_once __DIR__ . '/sqldev_common.php';

if (!sqldev_is_logged_in()) {
	header('Location: ' . rtrim($CONFIG->siteurl, '/') . '/secureAdmin/');
	exit;
}

$_SESSION['LAST_ACTIVITY'] = time();

$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/sqldev')), '/');
if ($base === '') {
	$base = '/sqldev';
}
$sqldevBase = $base . '/';
$p = sqldev_session_prefix();
$displayName = '';
if (!empty($_SESSION[$p . 'a_user_name'])) {
	$displayName = (string) $_SESSION[$p . 'a_user_name'];
} elseif (!empty($_SESSION[$p . 'user_name'])) {
	$displayName = (string) $_SESSION[$p . 'user_name'];
} elseif (!empty($_SESSION[$p . 'email_id'])) {
	$displayName = (string) $_SESSION[$p . 'email_id'];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>SQL Developer</title>
	<link rel="stylesheet" href="<?php echo htmlspecialchars($sqldevBase, ENT_QUOTES, 'UTF-8'); ?>assets/sqldev.css">
</head>
<body class="sqldev-body">
	<header class="sqldev-header">
		<div class="sqldev-header-inner">
			<h1 class="sqldev-title">SQL Dashboard</h1>
			<div class="sqldev-header-actions">
				<?php if ($displayName !== '') : ?>
					<span class="sqldev-user"><?php echo htmlspecialchars($displayName, ENT_QUOTES, 'UTF-8'); ?></span>
				<?php endif; ?>
				<label class="sqldev-toggle"><input type="checkbox" id="sqldev-dark" aria-label="Dark mode"> Dark</label>
				<div class="sqldev-zoom" aria-label="Editor font size">
					<button type="button" id="sqldev-zoom-out" title="Smaller">A−</button>
					<button type="button" id="sqldev-zoom-in" title="Larger">A+</button>
				</div>
			</div>
		</div>
	</header>

	<main class="sqldev-main">
		<div class="sqldev-layout">
		<section class="sqldev-panel sqldev-editor-panel sqldev-col-12" aria-labelledby="sqldev-editor-heading">
			<h2 id="sqldev-editor-heading" class="sqldev-section-title">Query editor</h2>
			<div class="sqldev-toolbar">
				<button type="button" id="sqldev-run" class="sqldev-btn sqldev-btn-primary">Execute query</button>
				<button type="button" id="sqldev-beautify" class="sqldev-btn" title="Format SQL in the editor">Beautify</button>
				<button type="button" id="sqldev-clear" class="sqldev-btn">Clear</button>
				<label class="sqldev-inline-label">Table for structure
					<input type="text" id="sqldev-table" class="sqldev-input" placeholder="e.g. qs_order" autocomplete="off" spellcheck="false">
				</label>
				<button type="button" id="sqldev-structure" class="sqldev-btn">Show table structure</button>
			</div>
			<label class="sqldev-label" for="sqldev-query">SQL <span class="sqldev-hint">(SELECT only; multiple JOINs allowed)</span></label>
			<textarea id="sqldev-query" class="sqldev-textarea" rows="16" spellcheck="false" wrap="soft" placeholder="SELECT * FROM your_table LIMIT 100"></textarea>
		</section>

		<section class="sqldev-panel sqldev-result-panel sqldev-col-12" aria-labelledby="sqldev-results-heading">
			<h2 id="sqldev-results-heading" class="sqldev-section-title">Result grid</h2>
			<div class="sqldev-result-toolbar">
				<span id="sqldev-status" class="sqldev-status" role="status"></span>
				<div class="sqldev-result-actions">
					<button type="button" id="sqldev-copy" class="sqldev-btn" disabled>Copy results (TSV)</button>
					<form id="sqldev-export-form" method="post" action="<?php echo htmlspecialchars($sqldevBase, ENT_QUOTES, 'UTF-8'); ?>export_csv.php" target="_blank">
						<input type="hidden" name="query" id="sqldev-export-query" value="">
						<button type="submit" id="sqldev-export" class="sqldev-btn" disabled>Export CSV</button>
					</form>
				</div>
			</div>
			<div id="sqldev-error" class="sqldev-error" hidden></div>
			<div class="sqldev-result-body">
				<div id="sqldev-loader" class="sqldev-loader" hidden aria-hidden="true" aria-busy="false">
					<div class="sqldev-loader-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="10" id="sqldev-loader-track">
						<div id="sqldev-loader-bar" class="sqldev-loader-bar" style="width:10%"></div>
					</div>
					<span id="sqldev-loader-label" class="sqldev-loader-label">Executing…</span>
				</div>
				<div id="sqldev-result-scroll" class="sqldev-result-scroll">
					<p id="sqldev-empty-state" class="sqldev-empty-state">Run a query or load table structure to see results here.</p>
					<table id="sqldev-grid" class="sqldev-grid sqldev-grid--hidden"></table>
				</div>
				<div class="sqldev-pagination">
					<button type="button" id="sqldev-prev" class="sqldev-btn" disabled>Previous</button>
					<span id="sqldev-page-info">Page 1</span>
					<button type="button" id="sqldev-next" class="sqldev-btn" disabled>Next</button>
				</div>
			</div>
		</section>
		</div>
	</main>

	<script>
		window.SQLDEV_BASE = <?php echo json_encode($sqldevBase, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
		window.SQLDEV_LOGIN = <?php echo json_encode(rtrim($CONFIG->siteurl, '/') . '/secureAdmin/', JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
	</script>
	<script src="<?php echo htmlspecialchars($sqldevBase, ENT_QUOTES, 'UTF-8'); ?>assets/sqldev.js" defer></script>
</body>
</html>
