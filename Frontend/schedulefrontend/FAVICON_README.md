# Schedule-It Favicon Setup

Your Schedule-It logo will now appear in browser tabs, bookmarks, and on mobile devices when deployed to Vercel.

## Current Setup

✅ **Metadata configured** in `src/app/layout.tsx`
✅ **Web App Manifest** created at `public/manifest.json`
✅ **Favicon generation script** available

## To Complete Favicon Setup

Since ImageMagick isn't installed, please generate favicons manually:

### Option 1: Online Favicon Generator (Recommended)

1. Go to [favicon.io](https://favicon.io/favicon-generator/) or [realfavicongenerator.net](https://realfavicongenerator.net/)
2. Upload your `public/scheduleitlogo.png` file
3. Generate favicons with these specifications:
   - **favicon.ico**: 16x16, 32x32, 48x48 pixels
   - **apple-touch-icon.png**: 180x180 pixels
   - **favicon-192x192.png**: 192x192 pixels (for PWA)
   - **favicon-512x512.png**: 512x512 pixels (for PWA)
   - **favicon-16x16.png**: 16x16 pixels
   - **favicon-32x32.png**: 32x32 pixels

4. Download the generated files and place them in the `public/` folder

### Option 2: Install ImageMagick and Run Script

```bash
# Install ImageMagick (Windows)
choco install imagemagick

# Or download from: https://imagemagick.org/script/download.php#windows

# Then run the generation script
npm run generate-favicons
```

## Files to Add to public/ Folder

After generating favicons, ensure these files exist in `public/`:

- `favicon.ico`
- `apple-touch-icon.png`
- `favicon-16x16.png`
- `favicon-32x32.png`
- `favicon-192x192.png`
- `favicon-512x512.png`

## Testing

After adding the favicon files:

1. Run `npm run build` to ensure everything compiles
2. The favicon will appear in:
   - Browser tabs
   - Bookmarks
   - Browser history
   - Mobile home screen (when added as PWA)
   - Vercel deployment

Your Schedule-It brand is now properly configured for production! 🚀