package id.satuhari.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Penyedia berkas internal untuk menerima hasil jepretan kamera.
 *
 * Aplikasi kamera perlu sebuah content:// URI sebagai tujuan penyimpanan
 * (file:// ditolak sejak Android 7). Berkas sementara disimpan di cache dan
 * dibaca lagi oleh WebView setelah pengambilan gambar selesai.
 */
public class NativeFiles extends ContentProvider {

    private static final String DIR = "kamera";
    private static final String NAME_AMAN = "[A-Za-z0-9._-]+";

    public static Uri uriFor(Context context, String name) {
        return Uri.parse("content://" + context.getPackageName() + ".files/" + DIR + "/" + name);
    }

    public static File fileFor(Context context, Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || !name.matches(NAME_AMAN)) {
            throw new FileNotFoundException("nama berkas tidak sah");
        }
        File dir = new File(context.getCacheDir(), DIR);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new FileNotFoundException("folder kamera tidak bisa dibuat");
        }
        return new File(dir, name);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override
    public String getType(Uri uri) {
        return "image/jpeg";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("hanya membaca dan menulis berkas");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        try {
            return fileFor(getContext(), uri).delete() ? 1 : 0;
        } catch (FileNotFoundException e) {
            return 0;
        }
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = fileFor(getContext(), uri);
        int flags;
        if ("r".equals(mode)) {
            flags = ParcelFileDescriptor.MODE_READ_ONLY;
        } else if ("rw".equals(mode)) {
            flags = ParcelFileDescriptor.MODE_READ_WRITE
                    | ParcelFileDescriptor.MODE_CREATE
                    | ParcelFileDescriptor.MODE_TRUNCATE;
        } else {
            flags = ParcelFileDescriptor.MODE_WRITE_ONLY
                    | ParcelFileDescriptor.MODE_CREATE
                    | ParcelFileDescriptor.MODE_TRUNCATE;
        }
        return ParcelFileDescriptor.open(file, flags);
    }
}
