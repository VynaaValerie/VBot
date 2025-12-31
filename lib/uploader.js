import fetch from 'node-fetch';
import { fileTypeFromBuffer } from 'file-type';
import FormData from 'form-data';

export async function uploadToCatbox(buffer) {
  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType) throw new Error('File type tidak dikenali');

  const ext = fileType.ext;
  const bodyForm = new FormData();
  
  bodyForm.append("fileToUpload", buffer, {
    filename: `file.${ext}`,
    contentType: fileType.mime
  });
  
  bodyForm.append("reqtype", "fileupload");

  const res = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: bodyForm,
    headers: bodyForm.getHeaders()
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Upload gagal: ${res.status} ${res.statusText} - ${errorText}`);
  }

  const data = await res.text();
  return data.trim();
}
