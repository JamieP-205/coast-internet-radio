(async function () {
  const title = document.getElementById('statusTitle');
  const text = document.getElementById('statusText');
  const box = document.getElementById('resultBox');

  function showError(message) {
    title.textContent = 'Test could not complete';
    text.textContent = message;
    box.textContent = message;
  }

  try {
    const response = await fetch('/.netlify/functions/stream-metadata-test', { cache: 'no-store' });
    const data = await response.json();
    box.textContent = JSON.stringify(data, null, 2);

    if (!data.ok) {
      showError(data.error || 'The test returned an error.');
      return;
    }

    if (data.conclusion === 'metadata_found') {
      title.textContent = 'Song metadata found';
      text.textContent = data.plainEnglish;
    } else if (data.conclusion === 'stream_reachable_no_song_metadata_found') {
      title.textContent = 'Stream works, but no song metadata found';
      text.textContent = data.plainEnglish;
    } else {
      title.textContent = 'Stream could not be reached';
      text.textContent = data.plainEnglish;
    }
  } catch (error) {
    showError(error && error.message ? error.message : String(error));
  }
})();
