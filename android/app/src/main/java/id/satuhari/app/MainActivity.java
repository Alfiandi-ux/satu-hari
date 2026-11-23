package id.satuhari.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Pembungkus Android untuk Satu Hari.
 *
 * Berkas web dibundel di assets/www lalu disajikan lewat asal https buatan
 * (https://satuhari.local/) memakai shouldInterceptRequest. Cara ini dipilih
 * karena IndexedDB — tempat seluruh jurnal disimpan — tidak tersedia untuk
 * halaman file://. Seluruh data tetap di perangkat, aplikasi tidak memakai
 * jaringan sama sekali.
 *
 * Jembatan SatuHariAndroid dipakai untuk menyimpan unduhan (ekspor cadangan
 * dan kartu bagikan) ke folder Download.
 */
public class MainActivity extends Activity {

    private static final String HOST = "satuhari.local";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final String BG = "#f5f0e6";
    private static final String FOLDER = "Satu Hari";

    private static final int REQ_PICK = 1001;
    private static final int REQ_CAMERA = 1002;
    private static final int REQ_WRITE = 1003;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;

    // Antrean satu berkas untuk kasus izin tulis (Android 6-9).
    private String pendingName;
    private String pendingMime;
    private byte[] pendingData;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor(BG));
        getWindow().setNavigationBarColor(Color.parseColor(BG));
        if (Build.VERSION.SDK_INT >= 23) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor(BG));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "SatuHariAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        setContentView(web);
        web.loadUrl(START_URL);
    }

    /* ---------------- aset web ---------------- */

    private WebResourceResponse serve(Uri uri) {
        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
        if (path.contains("..")) return notFound();
        String asset = "www" + path;
        try {
            InputStream in = getAssets().open(asset);
            return new WebResourceResponse(mimeOf(asset), "utf-8", 200, "OK", headers(), in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers(),
                new ByteArrayInputStream(new byte[0]));
    }

    private static Map<String, String> headers() {
        Map<String, String> map = new HashMap<>();
        map.put("Cache-Control", "no-cache");
        return map;
    }

    private static String mimeOf(String path) {
        String lower = path.toLowerCase(Locale.US);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".js")) return "application/javascript";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".webmanifest")) return "application/manifest+json";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    /* ---------------- jembatan JS ---------------- */

    private class Bridge {
        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "1.0.0";
            }
        }

        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            byte[] data;
            try {
                data = Base64.decode(base64, Base64.DEFAULT);
            } catch (Exception e) {
                toastOnUi("Gagal menyiapkan berkas");
                return;
            }
            final String safeName = safeFileName(name);
            final String safeMime = (mime == null || mime.isEmpty())
                    ? "application/octet-stream"
                    : mime.split(";")[0];
            final byte[] payload = data;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    saveBytes(safeName, safeMime, payload);
                }
            });
        }

        @JavascriptInterface
        public void toast(String message) {
            toastOnUi(message);
        }
    }

    private void toastOnUi(final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private static String safeFileName(String name) {
        String cleaned = (name == null || name.trim().isEmpty()) ? "satu-hari" : name.trim();
        cleaned = cleaned.replaceAll("[\\\\/:*?\"<>|]+", "-");
        return cleaned.length() > 120 ? cleaned.substring(0, 120) : cleaned;
    }

    /* ---------------- penyimpanan berkas ---------------- */

    private void saveBytes(String name, String mime, byte[] data) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveWithMediaStore(name, mime, data);
                return;
            }
            if (checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                pendingName = name;
                pendingMime = mime;
                pendingData = data;
                requestPermissions(
                        new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_WRITE);
                return;
            }
            saveLegacy(name, data);
        } catch (Exception e) {
            toastOnUi("Gagal menyimpan: " + e.getMessage());
        }
    }

    @android.annotation.TargetApi(Build.VERSION_CODES.Q)
    private void saveWithMediaStore(String name, String mime, byte[] data) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
        Uri item = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (item == null) throw new IOException("folder Download tidak tersedia");
        OutputStream out = getContentResolver().openOutputStream(item);
        if (out == null) throw new IOException("berkas tidak bisa dibuka");
        try {
            out.write(data);
            out.flush();
        } finally {
            out.close();
        }
        toastOnUi("Tersimpan di Download/" + FOLDER + "/" + name);
    }

    private void saveLegacy(String name, byte[] data) throws IOException {
        File dir = new File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER);
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("folder Download tidak bisa dibuat");
        File file = uniqueFile(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(data);
        }
        android.media.MediaScannerConnection.scanFile(
                this, new String[]{file.getAbsolutePath()}, null, null);
        toastOnUi("Tersimpan di Download/" + FOLDER + "/" + file.getName());
    }

    private static File uniqueFile(File dir, String name) {
        File file = new File(dir, name);
        if (!file.exists()) return file;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 2; i < 1000; i++) {
            File candidate = new File(dir, base + " (" + i + ")" + ext);
            if (!candidate.exists()) return candidate;
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + ext);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_WRITE) return;
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted && pendingData != null) {
            try {
                saveLegacy(pendingName, pendingData);
            } catch (Exception e) {
                toastOnUi("Gagal menyimpan: " + e.getMessage());
            }
        } else {
            toastOnUi("Izin penyimpanan ditolak — berkas tidak disimpan");
        }
        pendingName = null;
        pendingMime = null;
        pendingData = null;
    }

    /* ---------------- kamera & pemilih berkas ---------------- */

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            if (params != null && params.isCaptureEnabled() && hasCamera()) {
                if (startCamera()) return true;
            }
            return startPicker(params);
        }
    }

    private boolean hasCamera() {
        return getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY);
    }

    private boolean startCamera() {
        try {
            String name = "foto-" + System.currentTimeMillis() + ".jpg";
            cameraUri = NativeFiles.uriFor(this, name);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(intent, REQ_CAMERA);
            return true;
        } catch (Exception e) {
            cameraUri = null;
            return false;
        }
    }

    private boolean startPicker(WebChromeClient.FileChooserParams params) {
        String type = "*/*";
        if (params != null) {
            String[] accepted = params.getAcceptTypes();
            if (accepted != null) {
                for (String item : accepted) {
                    if (item != null && item.contains("image/")) {
                        type = "image/*";
                        break;
                    }
                }
            }
        }
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(type);
        try {
            startActivityForResult(Intent.createChooser(intent, "Pilih foto"), REQ_PICK);
            return true;
        } catch (Exception e) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = null;
            toastOnUi("Tidak ada aplikasi berkas");
            return false;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_PICK && requestCode != REQ_CAMERA) return;
        if (fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (requestCode == REQ_CAMERA && cameraUri != null) {
                result = new Uri[]{cameraUri};
            } else if (data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
        cameraUri = null;
    }

    /* ---------------- navigasi ---------------- */

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) return null;
            if (!"https".equals(uri.getScheme())) return null;
            if (uri.getHost() == null || !HOST.equalsIgnoreCase(uri.getHost())) return null;
            return serve(uri);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) return false;
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            if ("https".equals(scheme) && HOST.equalsIgnoreCase(String.valueOf(uri.getHost()))) {
                return false;
            }
            if ("http".equals(scheme) || "https".equals(scheme)
                    || "mailto".equals(scheme) || "tel".equals(scheme)) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception e) {
                    toastOnUi("Tautan tidak bisa dibuka");
                }
                return true;
            }
            return true;
        }
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        // Di dalam lembar detail/pengaturan, tombol kembali menutup lembar lebih dulu.
        String script = "(function(){"
                + "var d=document.getElementById('detailSheet');"
                + "var s=document.getElementById('settingsSheet');"
                + "var open=(d&&!d.hidden)||(s&&!s.hidden);"
                + "if(open){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return '1';}"
                + "return '0';})()";
        web.evaluateJavascript(script, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if ("\"1\"".equals(value)) return;
                if (web != null && web.canGoBack()) web.goBack();
                else finish();
            }
        });
    }

    @Override
    protected void onPause() {
        if (web != null) {
            // Menyimpan suntingan yang masih tertunda sebelum aplikasi ditinggalkan.
            web.evaluateJavascript("window.dispatchEvent(new Event('pagehide'));", null);
            web.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
