# Eli's Crunch proposal website

This is a static, frontend-only proposal for a menu and Messenger-first ordering experience. It does not have a server-side order system, Messenger integration, admin authentication, shared database, payment gateway, or order tracking.

## Messenger ordering

1. Browse the menu, add items, and open checkout.
2. Enter customer and fulfillment details, choose a payment preference, and review the generated order message.
3. Use the button to open the configured Facebook/Messenger conversation. The browser may copy the message to the clipboard; if not, use **Copy Order Details** or select the visible message and copy it manually.
4. Paste the message into Messenger and press **Send** yourself. Opening Messenger or copying the message does not send an order. The order is not accepted or confirmed until Eli's Crunch replies.

The checkout message is generated from the current product catalog and cart. It is not saved as an order or placed in a URL. Customer checkout details stay in page memory, are cleared when leaving checkout, and are included in the message only when the customer chooses to copy or send it. Special instructions are also memory-only. Refreshing the page clears both; only product IDs and quantities remain in the browser-stored cart. Do not use real customer data during a proposal presentation.

## Demo configuration and limitations

- The official Messenger conversation URL is intentionally blank until the owner supplies and confirms it. Do not invent a URL or present a test destination as the business page.
- **Ordering & Checkout Settings** is available at `/admin/settings`; the browser-only tools are also reachable at `/admin`. The admin preview uses the demo code `CRUNCH-DEMO`, stored in client-side JavaScript and valid for the current browser tab only. This gate is for presentation and is not authentication; it can be bypassed. Do not put credentials, secrets, or real customer information in this project.
- Settings, product edits, and uploaded product images are stored in the current browser's local storage. They do not update the deployed static files, synchronize to another browser/device, or become available to public visitors. A shared production configuration requires changing the deployed public config or building a secured shared backend.
- Available cash payment selections are preferences included in the message only. GCash is temporarily unavailable. This website does not accept or verify payments or claim a transaction succeeded. The owner must confirm available methods and provide payment instructions through Messenger.
- Hours, address/locality, delivery availability, delivery fee, delivery coverage, pickup availability/location, contact details, and Facebook page are unconfirmed proposal values. Confirm them with the owner before presenting them as business policy. Unconfirmed delivery charges and the final total are explicitly left for confirmation in Messenger.
- Messenger conversations are not imported into a dashboard. There is no website order inbox, order status workflow, customer tracking, or sales analytics.
- On the first load after this migration, obsolete browser-only demo orders, payment-proof drafts, and saved special-instruction notes are removed from local storage.
- Food images shown in this demo are for presentation purposes and may be replaced with official Eli's Crunch product photos supplied or approved by the owner.

## Owner setup before production

Ask the owner to provide or confirm:

- The official Facebook/Messenger conversation URL
- High-resolution, owner-approved product photos and logo files
- Business hours and preferred product descriptions
- Delivery areas, fees, delivery availability, and pickup availability/location
- Contact details and Facebook page information
- Available payment methods and the intended secure payment process

The production site should replace temporary images and proposal text with owner-approved assets and policies. A real order inbox, payment processing, shared settings, customer tracking, or authenticated admin area requires a secure backend and appropriate privacy/security review; this static proposal does not provide those features.

## Image management

Product image assignments and `imageSource` metadata are centralized in `data.js`: `official` identifies owner-supplied or owner-approved photos, while `temporary-demo` identifies temporary presentation imagery. Product cards and the homepage slideshow reuse the centralized product data.

In the browser-only proposal, uploaded product photos and menu edits are saved only in that browser. For the deployed public menu, update the centralized assets and product data in the project and redeploy. Replace a temporary image path and mark it `official` only after the owner supplies or approves the actual photo.

## Run locally

Requires Node.js. From this folder, run:

```powershell
npm.cmd start
```

Then open `http://localhost:4173`.

## Deployment

The included `vercel.json` explicitly selects Vercel's **Other** framework preset, disables build/install commands, serves the project root as static output, and rewrites application routes to `index.html` for direct visits and browser refreshes. The matching Vercel project settings should use the repository root as the Root Directory, leave Build and Install Commands empty, and use `.` as the Output Directory. Do not select the Node.js framework: `server.js` is only the local development server. The `_redirects` file enables equivalent history-route fallback on Netlify.
