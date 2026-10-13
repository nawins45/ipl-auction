# 🏆 IPL Auction Simulator (Multiplayer Game)

A real-time, interactive multiplayer IPL Auction Simulator web application built with **React**, **Vite**, **Tailwind CSS**, and **Firebase**.

Live Demo: [https://svdn-ipl.web.app](https://svdn-ipl.web.app)

---

## ⚡ Features

- **Real-Time Multiplayer Bidding:** Live bidding synchronization across all connected team owners and auctioneer using Firebase Firestore real-time listeners (`onSnapshot`).
- **Auctioneer Host Dashboard:**
  - Full auction control (bidding start, sold, unsold, pause, sets).
  - Ability to Mute/Unmute bidders on the fly directly from the Teams overview.
  - Custom rules setup (purse limits, retention, squad size).
- **Team Owners & Squad Management:**
  - Live purse tracking and squad composition analytics.
  - Interactive touch-enabled drag-and-drop squad reordering on both PC and mobile devices.
  - Player watchlist with real-time bidding alerts.
- **Audio & Visual Immersion:**
  - Real-time heartbeat sound effect during tense, high-stakes bidding wars.
  - Confetti and celebration animations when players are sold.
- **Mini-Game Battle Arena:**
  - Post-auction head-to-head battle where drafted squads compete across player stats (Runs, Strike Rate, Wickets, Economy, etc.).
  - Detailed stat-by-stat cinematic comparison reveal.
- **Comprehensive Podium & Results:**
  - 3-tier podiums: Auction round rank, Mini-Game rank, and Overall tournament champion based on combined score.
  - Awards for Steal of the Auction, Blockbuster buys, and squad balance.

---

## 🛠️ Tech Stack

- **Frontend:** React 18, Vite
- **Styling:** Tailwind CSS, PostCSS, Custom Animations
- **Backend / Real-Time Database:** Firebase Firestore
- **Authentication:** Firebase Auth
- **Hosting:** Firebase Hosting

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nawins45/ipl-auction.git
   cd ipl-auction
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env` and fill in your Firebase project configuration:
   ```env
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_AUCTIONEER_PASSWORD=your_auctioneer_password
   ```

4. **Run Development Server:**
   ```bash
   npm run dev
   ```

5. **Build for Production:**
   ```bash
   npm run build
   ```

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
