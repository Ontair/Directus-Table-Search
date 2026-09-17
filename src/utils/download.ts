/**
 * Directus returns a rendered export as a file body, so the browser only has
 * to save it. The object URL is released after the click has been dispatched,
 * because revoking it synchronously cancels the download in some browsers.
 */
export function downloadFile(filename: string, data: Blob): void {
	const url = URL.createObjectURL(data);
	const anchor = document.createElement('a');
	anchor.download = filename;
	anchor.href = url;
	anchor.style.display = 'none';
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}
