# Eli's Crunch proposal website

This is a frontend-only proposal demo. Menu data is centralized in `data.js`; cart, demo orders, settings, product image uploads, and sample payment screenshots are stored in the browser's local storage. Nothing is sent to Eli's Crunch, no real payment is processed, and no delivery or customer notification is connected.

## Important demo limitations

- The GCash screen is a simulated screenshot-review walkthrough. It has no GCash account, gateway, transfer, or payment verification. Do not send money, use real sender/customer details, or upload a real receipt.
- The displayed sample hours (8 AM-9 PM), proposed Nabunturan locality, delivery fee, delivery coverage, and delivery/pickup options are unconfirmed examples. The owner must confirm business hours, pickup availability and location, coverage, fees, contact information, and Facebook details before these can be presented as business policies.
- The demo login is public and client-side only. It is not authentication. Never reuse its credentials or store real customer or payment information in this project.
- Browser local storage is not secure, is limited to the current browser/device, and does not synchronize between customers and the admin. Payment screenshots are saved locally and are unsuitable for production.
- Product and hero photography includes temporary demo placeholders, not verified photos of Eli's Crunch portions. The owner can provide or approve actual product photos for replacement. The About page and footer disclose this.
- Dashboard totals and statuses are illustrative browser-only demo values; GCash walkthrough orders are excluded from sales/product analytics. They are not real business performance.

## Owner presentation walkthrough

Use fictional data throughout. The public demo login details below are intentionally visible to anyone who can access the site.

1. Open `/menu`, add a product, and continue through `/cart` to checkout.
2. Use a made-up name, phone number, address, and barangay. These values remain in this browser.
3. Choose Delivery or Pickup as a demonstration only. Choose GCash to show the simulated payment-review flow.
4. On the demo payment page, enter a fictional reference such as `DEMO-REF-001` and sender such as `Demo Sender`. Select a harmless sample image with no real payment or personal information, then submit it.
5. Open `/admin` in the same browser and sign in:
   - Email: `demo@eliscrunch.local`
   - Password: `demo123`
6. Open **Orders** and select the demo order. The screenshot is visible only in the local admin demo; use **Complete Demo Review** to advance the simulated state. This does not verify a transfer, confirm funds, or accept a real business order. The reject path can also be demonstrated with a fictional reason.
7. Return to the confirmation page or open **Track Order** and enter the shown demo order number. Confirm the review status changes to **Demo review complete (simulated)**. No screenshot is exposed on public tracking pages.
8. Use **Business Settings → Reset Demo Data** after the presentation to clear browser-saved orders, screenshot, cart, and settings. This does not clear other browsers or devices.

This is a static proposal: use the same browser for checkout, admin review, and tracking. Do not create real customer data or real payment screenshots for the demo.

## Image management

Product image assignments and `imageSource` metadata are centralized in `data.js`: `official` identifies supplied or owner-approved photos, while `temporary-demo` identifies temporary fetched references. Temporary image source and license notes are in `images/products/image-sources.json`.

To replace a placeholder, upload an owner-supplied/approved JPG, PNG, or WebP photo in **Admin → Menu Management**, or update its centralized image path and source in `data.js`. Product cards, checkout, and the homepage slideshow reuse this menu data. Admin uploads are stored in this browser's local storage, not on a server.

Before production approval, ask the owner to provide or confirm:

- High-resolution actual product photos and approval for their use
- Current logo files
- GCash details and the intended secure payment process
- Business hours
- Delivery areas and fees
- Pickup availability and pickup location
- Contact information and Facebook page
- Preferred product descriptions

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

These are public demo credentials, not secrets. Authentication is frontend-only and can be bypassed; do not use them for a real admin account. Never enter real customer information or payment details.

## Deployment

The included `vercel.json` explicitly selects Vercel's **Other** framework preset, disables build/install commands, serves the project root as static output, and rewrites application routes to `index.html` for direct visits and browser refreshes. The matching Vercel project settings should use the repository root as the Root Directory, leave Build and Install Commands empty, and use `.` as the Output Directory. Do not select the Node.js framework: `server.js` is only the local development server. The `_redirects` file enables equivalent history-route fallback on Netlify. The included Node server serves the app shell for local development.
