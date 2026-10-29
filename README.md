# Eli's Crunch proposal website

This is a frontend-only ordering and admin demo. Menu data is centralized in `data.js`; demo cart, orders, availability, and settings are stored in the browser's local storage. No real payment, delivery dispatch, or customer notification is connected.

Admins can upload an optional JPG, PNG, or WebP product image in Menu Management. Images are resized in the browser and saved with the demo product in local storage; they are not uploaded to a server and may use this browser's storage quota.

Checkout supports immediate or scheduled orders and uses the customer's local time. Business hours, the 30-minute schedule interval, the seven-day booking window, and available demo payment methods are centralized near the top of `app.js`. Scheduled orders are saved in local storage, start with the **Scheduled** status, and cannot use Cash on Delivery.

GCash checkout is a manual-verification proposal flow. Delivery orders paid with GCash and pickup orders paid with GCash save an order draft before routing to `/payment/gcash`; scheduled delivery requires GCash. Customers submit a reference number, sender name, and a compressed screenshot. Admins can review, verify, or reject the proof and add a rejection reason. The demo GCash account is a clearly marked placeholder: never send real money. Orders, drafts, and payment screenshots are stored only in this browser's local storage, which is not secure or suitable for real payment proofs or production use. No GCash gateway, secure server-side storage, or payment notification is connected.

Product photo assignments are centralized in `data.js`. Each product stores its image path and an `imageSource` value: `official` for the supplied Dinakdakan image and owner-provided images uploaded through Menu Management, and `temporary-demo` for the locally saved, fetched Unsplash placeholders. The admin menu labels these sources. Unsplash source URLs and license details are in `images/products/image-sources.json`. Temporary placeholders are dish-matched presentation references, not verified photos of Eli's actual portions; the About page and footer disclose that distinction. Existing saved menu data is migrated to include the image-source metadata.

The homepage food slideshow selects products from this same menu dataset, so its images and captions stay in sync with the catalog. To replace a placeholder, upload an owner-supplied/approved food photo in Admin → Menu Management or update the centralized path in `data.js`; no product-card or checkout code needs to change. Uploaded demo photos are stored in this browser's local storage, not on a server.

Before production approval, ask the owner for:

- High-resolution, actual product food photos and approval for their use
- Current logo files
- Confirmed GCash account details
- Business hours
- Delivery areas and fees
- Contact information and Facebook page information
- Any preferred product descriptions

## Run locally

Requires Node.js. From this folder, run:

```powershell
npm.cmd start
```

Then open `http://localhost:4173`.

## Demo admin

- URL: `/admin`
- Email: `demo@eliscrunch.local`
- Password: `demo123`

Authentication is frontend demo protection only. Use **Reset Demo Data** in Admin → Business Settings to restore the original menu and clear this browser's demo orders and settings.

## Deployment

The included `vercel.json` explicitly selects Vercel's **Other** framework preset, disables build/install commands, serves the project root as static output, and rewrites application routes to `index.html` for direct visits and browser refreshes. The matching Vercel project settings should use the repository root as the Root Directory, leave Build and Install Commands empty, and use `.` as the Output Directory. Do not select the Node.js framework: `server.js` is only the local development server. The `_redirects` file enables equivalent history-route fallback on Netlify. The included Node server serves the app shell for local development.
