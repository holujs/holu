import { createWriteStream } from 'node:fs';
import type { MulterParsedForm } from '@holu/body-parser';
import type { RawResponse } from '@holu/rest';

export function saveFiles(parsedForm: MulterParsedForm) {
  const promises: Promise<void>[] = [];
  parsedForm.files.forEach((file) => {
    const promise = new Promise<void>((resolve, reject) => {
      const path = `uploaded-files/${file.originalName}`;
      const writableStream = createWriteStream(path).on('error', reject).on('finish', resolve);
      file.stream.pipe(writableStream);
    });
    promises.push(promise);
  });

  return Promise.all(promises);
}

export function sendHtmlForm(rawRes: RawResponse) {
  rawRes.setHeader('Content-Type', 'text/html');
  rawRes.end(`
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Uploads files</title>
</head>
<body>
  <form method="post" enctype="multipart/form-data">
      <label for="fieldId">Select files:</label>
      <input type="file" id="fieldId" name="fieldName" multiple>
      <br>
      <input type="submit">
  </form>
</body>
</html>
    `);
}
