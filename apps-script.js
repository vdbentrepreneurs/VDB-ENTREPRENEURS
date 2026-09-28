/**
 * Google Apps Script for VDB ENTREPRENEURS
 * Instructions:
 * 1. Go to https://script.google.com/ and create a new project.
 * 2. Paste this code into the Code.gs file.
 * 3. Replace 'YOUR_FOLDER_ID' with the actual ID of the Google Drive folder where you want to store bill photos.
 * 4. Click 'Deploy' -> 'New deployment'.
 * 5. Select type 'Web app'.
 * 6. Set 'Execute as' to 'Me' and 'Who has access' to 'Anyone'.
 * 7. Deploy and copy the Web App URL. Use this URL in your React app to upload/delete photos.
 */

const FOLDER_ID = 'YOUR_FOLDER_ID'; // <-- REPLACE THIS

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const folder = DriveApp.getFolderById(FOLDER_ID);
    
    // ACTION: UPLOAD
    if (data.action === 'upload') {
      const dataStr = data.base64.split(',')[1] || data.base64; // Remove data uri prefix if present
      const blob = Utilities.newBlob(Utilities.base64Decode(dataStr), data.mimeType, data.filename);
      const file = folder.createFile(blob);
      
      // Allow file to be viewed publicly (Optional, depending on your security needs)
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      return createJsonResponse({
        status: 'success',
        fileId: file.getId(),
        fileUrl: file.getUrl(),
        downloadUrl: file.getDownloadUrl()
      });
    } 
    
    // ACTION: DELETE
    if (data.action === 'delete') {
      const fileId = data.fileId;
      const file = DriveApp.getFileById(fileId);
      
      // Move to trash instead of permanent delete for safety
      file.setTrashed(true);
      
      return createJsonResponse({
        status: 'success',
        message: 'File moved to trash successfully'
      });
    }

    return createJsonResponse({ status: 'error', message: 'Invalid action provided' });

  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: error.toString()
    });
  }
}

// Handle CORS Preflight (OPTIONS request) for React fetch API
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Helper function to return JSON response with CORS headers
function createJsonResponse(responseObject) {
  return ContentService.createTextOutput(JSON.stringify(responseObject))
    .setMimeType(ContentService.MimeType.JSON);
}
