// ============================================================
// FurniQc — Google sign-in
// Uses Google Identity Services (GIS) for the OAuth token and
// gapi.client for calling Drive v3 / Sheets v4. Loaded from:
//   https://accounts.google.com/gsi/client
//   https://apis.google.com/js/api.js
// (script tags are in index.html)
// ============================================================

const GoogleAuth = (() => {
  let tokenClient = null;
  let accessToken = null;
  let gapiReady = false;

  function initGapiClient() {
    return new Promise((resolve) => {
      gapi.load("client", async () => {
        await gapi.client.init({
          apiKey: CONFIG.GOOGLE_API_KEY,
          discoveryDocs: [
            "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
            "https://sheets.googleapis.com/$discovery/rest?version=v4"
          ]
        });
        gapiReady = true;
        resolve();
      });
    });
  }

  function initTokenClient(onGrantedCallback) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: CONFIG.GOOGLE_SCOPES,
      callback: (resp) => {
        if (resp.error) {
          console.error("Google sign-in failed:", resp);
          return;
        }
        accessToken = resp.access_token;
        gapi.client.setToken({ access_token: accessToken });
        onGrantedCallback && onGrantedCallback();
      }
    });
  }

  async function init(onGrantedCallback) {
    await initGapiClient();
    initTokenClient(onGrantedCallback);
  }

  function signIn() {
    if (!tokenClient) {
      console.error("GoogleAuth.init() must run before signIn()");
      return;
    }
    // "consent" first time, silent refresh afterwards (browser caches the grant)
    tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  }

  function signOut() {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken, () => {});
      accessToken = null;
      gapi.client.setToken(null);
    }
  }

  function isSignedIn() {
    return !!accessToken;
  }

  return { init, signIn, signOut, isSignedIn };
})();
