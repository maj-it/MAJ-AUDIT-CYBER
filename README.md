# MAJ Audit

Plateforme GRC d'audit cybersécurité par **MAJ-IT** (Babette Flore Majeu).

- Référentiels : ANSSI TPE (12), ANSSI (42), ISO 27001 (93), NIST CSF (19), RGPD (58), NIS2 (37)
- Scoring par maturité, plan d'actions, rapports PDF / Excel, sauvegarde JSON
- Scan externe (ports, en-têtes, TLS, DNS, sous-domaines) avec note A–F
- Assistant IA : Ollama/Qwen local en priorité, repli par règles, Gemini via proxy serveur (consentement requis). Les suggestions IA doivent être validées avant export.
- Mode SaaS optionnel (Supabase)

## Démarrage

```bash
npm install
cp .env.example .env   # puis renseigner les variables nécessaires
npm run dev
```

## Sécurité

- Ne jamais committer `.env`. Les clés (`GEMINI_API_KEY`, `SCAN_TOKEN`) restent côté serveur, sans préfixe `VITE_`.
- Les comptes de démo n'existent qu'en mode développement.
- N'auditer et ne scanner que des systèmes pour lesquels une autorisation écrite a été obtenue.
# maj-audit
