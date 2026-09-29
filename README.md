# Real-Time Meta Lead Ads Pipeline & Live Leads Dashboard

A high-performance Proof of Concept (PoC) demonstrating real-time ingestion of Meta (Facebook/Instagram) Lead Ads via Webhooks, Meta Graph API enrichment, in-memory deduplication, and zero-latency WebSocket broadcasting to active clients.

---

## 🚀 Quick Start

### 1. Start the Server
```bash
npm start
```
* **Web Dashboard**: [http://localhost:4000](http://localhost:4000)
* **Health Check**: [http://localhost:4000/health](http://localhost:4000/health)
* **REST Leads API**: [http://localhost:4000/leads](http://localhost:4000/leads)
* **Webhook Endpoint**: [http://localhost:4000/webhook/meta](http://localhost:4000/webhook/meta)

---

## 🎯 Architecture

```
Meta Lead Testing Tool
        ↓  (HTTP POST /webhook/meta)
Public Tunnel (ngrok / Cloudflare)
        ↓  (Forward to port 4000)
Backend Webhook Server (server.js)
  • Deduplication Check (O(1) Set)
  • Meta Graph API Fetch (leads_retrieval)
  • Real-time WebSocket Push (Socket.IO)
        ↓
Connected Web Dashboard & Mobile Clients
  • Instant Slide-in Lead Rendering
  • Audio Chime Synthesizer
```

---

## 🛠 Features Built-In

1. **Live Leads Stream**: Real-time reactive cards with instant slide-down animations, badge counters, and search filtering.
2. **Meta Ads Testing Tool Simulator**: Built-in interactive simulator with 4 preset business scenarios (Solar, Luxury Real Estate, B2B SaaS, Auto).
3. **Raw Webhook Dispatcher**: Test actual Meta `entry[0].changes[0].value.leadgen_id` payloads with one click.
4. **Real-time Webhook Inspector & Live Terminal**: Inspect incoming requests, verification handshakes, Graph API fetches, and socket broadcasts.
5. **Simulated Mobile View (Phone Frame)**: Demonstrates the mobile app experience right inside the browser.
6. **Loom 5-Minute Presentation Timer**: Rehearsal countdown clock and talking points checklist.

---

## 🔗 Connecting to Live Meta Lead Ads (Production / Live Test)

1. Expose your local port `4000` via ngrok:
   ```bash
   ngrok http 4000
   ```
2. In your [Meta App Dashboard](https://developers.facebook.com) $\rightarrow$ **Webhooks** $\rightarrow$ **Page**:
   * **Callback URL**: `https://<your-ngrok-subdomain>.ngrok-free.app/webhook/meta`
   * **Verify Token**: `meta_lead_ads_secret_token_2026`
   * **Subscription Field**: `leadgen`
3. Add your Page Access Token inside `.env`:
   ```env
   META_PAGE_ACCESS_TOKEN=your_actual_page_access_token_here
   ```
4. Open the [Meta Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing), select your Page and Form, and click **Create Lead**.
