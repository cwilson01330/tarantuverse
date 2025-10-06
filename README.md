# 🕷️ Tarantuverse

**The ultimate tarantula husbandry tracking platform for hobbyists and breeders.**

Tarantuverse is a cross-platform application (web + mobile) that helps tarantula keepers track their collections, breeding projects, and care routines with reliability and beautiful design.

---

## ✨ Features

### Core Tracking
- 📋 **Collection Management**: Track unlimited tarantulas with detailed profiles
- 🍽️ **Feeding Logs**: Schedule reminders and track acceptance rates
- 🦀 **Molt Tracking**: Record molts, measure growth, predict cycles
- 📸 **Photo Gallery**: Document your spiders' growth over time
- 🔔 **Smart Reminders**: Never miss a feeding or care task

### Breeding Suite
- 💑 **Pairing Logs**: Track male/female pairings
- 🥚 **Egg Sac Management**: Monitor incubation and hatch dates
- 👶 **Offspring Tracking**: Manage slings from hatch to sale
- 🌳 **Lineage View**: Visualize genetics and breeding projects

### Analytics & Insights
- 📊 **Growth Charts**: Visualize size and weight over time
- 📈 **Feeding Patterns**: Understand your spiders' appetites
- 🔮 **Molt Predictions**: Estimate next molts based on history
- 💰 **Collection Value**: Track costs and breeding revenue

### Community
- 👥 **Public Profiles**: Share your collection with the world
- 💬 **Forums**: Discuss species and techniques
- 🏆 **Breeding Projects**: Showcase your genetics work
- 🛒 **Marketplace**: Find buyers and sellers (listings only)

### Knowledge Base
- 📚 **Species Database**: Searchable care guides for 100+ species
- 🔍 **Smart Search**: Filter by care level, region, temperament
- 📖 **Care Guides**: Detailed husbandry information
- 🎓 **Growing Library**: Community-contributed knowledge

---

## 🚀 Why Tarantuverse?

Existing apps suffer from:
- ❌ Catastrophic data loss during updates
- ❌ Poor breeding tools (if any)
- ❌ Outdated, confusing UX
- ❌ No community features
- ❌ Limited analytics

**Tarantuverse solves these problems:**
- ✅ **Bulletproof cloud sync** - Your data is always safe
- ✅ **Full breeding lifecycle** - From pairing to offspring sales
- ✅ **Modern, intuitive UI** - Beautiful and easy to use
- ✅ **Connected community** - Share and learn together
- ✅ **Powerful analytics** - Understand your collection

---

## 🏗️ Tech Stack

- **Frontend Web**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Frontend Mobile**: React Native (Expo), TypeScript
- **Backend**: Python FastAPI, SQLAlchemy
- **Database**: PostgreSQL 15
- **Auth**: Firebase Auth / Supabase
- **Storage**: Cloudflare R2 / AWS S3
- **Hosting**: Vercel (web), EAS (mobile), Railway/Render (API)

---

## 📂 Project Structure

```
tarantuverse/
├── apps/
│   ├── web/        # Next.js web application
│   ├── mobile/     # React Native mobile app
│   └── api/        # FastAPI backend
├── packages/
│   └── shared/     # Shared types and utilities
├── docs/           # Documentation
└── scripts/        # Development tools
```

---

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 15+
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/tarantuverse.git
cd tarantuverse

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start PostgreSQL (via Docker)
docker-compose up -d postgres

# Run database migrations
cd apps/api
alembic upgrade head

# Start development servers
cd ../..
pnpm dev  # Starts all apps concurrently
```

Individual apps:
```bash
pnpm dev:web      # Next.js web app (http://localhost:3000)
pnpm dev:mobile   # React Native mobile app
pnpm dev:api      # FastAPI backend (http://localhost:8000)
```

---

## 📖 Documentation

- [Project Plan & Architecture](./PROJECT_PLAN.md)
- [API Documentation](./docs/api/README.md) (coming soon)
- [Contributing Guidelines](./CONTRIBUTING.md) (coming soon)
- [Database Schema](./docs/architecture/schema.md) (coming soon)

---

## 🗺️ Roadmap

- **Phase 1 (Months 1-3)**: MVP - Core tracking features
- **Phase 2 (Months 4-5)**: Breeding tools & analytics
- **Phase 3 (Months 6-7)**: Community features
- **Phase 4 (Months 8+)**: Advanced features & monetization

See [PROJECT_PLAN.md](./PROJECT_PLAN.md) for detailed roadmap.

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](./CONTRIBUTING.md) first.

---

## 📄 License

[MIT License](./LICENSE) (or your preferred license)

---

## 💬 Support

- **Email**: support@tarantuverse.com (placeholder)
- **Discord**: [Join our community](https://discord.gg/tarantuverse) (placeholder)
- **GitHub Issues**: [Report bugs or request features](https://github.com/yourusername/tarantuverse/issues)

---

## 🙏 Acknowledgments

Built with ❤️ for the tarantula keeping community.

Inspired by the amazing keepers on Arachnoboards and the need for better tools.

---

**Status**: 🚧 In Development

**Version**: 0.1.0-alpha
