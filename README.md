# IPTMS — Industrial Practical Training Management System

Mfumo kamili wa uwasilishaji na idhini ya logbook za mafunzo kwa vitendo
(IPT), pamoja na maombi ya ruhusa, kwa mtiririko:

**Mwanafunzi → Industrial Supervisor → University Supervisor → Head of
Faculty**, ukisimamiwa na **Superadmin**.

Toleo hili ni programu kamili ya server (Node.js/Express + PostgreSQL),
tofauti na mfano wa awali wa HTML-pekee. Mabadiliko makuu:

- **Uthibitisho wa kweli (login/register)** wenye password iliyosimbwa
  (bcrypt), badala ya "chagua role kwenye dropdown" ya awali (ambayo
  ilimruhusu mtu yeyote kujifanya role/mtumiaji yeyote).
- **Saini ya kila mtumiaji inahifadhiwa kwenye database wakati wa
  kujisajili.** Wakati wa kusaini nyaraka, mtumiaji haichori tena —
  mfumo unatumia moja kwa moja saini yake iliyohifadhiwa, baada tu ya
  yeye kubonyeza "Tumia Saini Hii". Mtumiaji anaweza kusasisha saini yake
  wakati wowote kwenye ukurasa wa "Wasifu Wangu".
- Kila hatua ya idhini (industrial/university/faculty) inathibitishwa na
  role halisi ya session ya server — si kitu kinachotumwa na kivinjari —
  hivyo mtumiaji hawezi kujifanya role nyingine.
- Database halisi ya PostgreSQL (siyo hifadhi ya kivinjari), inayofanya
  data idumu kwa uhakika hata baada ya kuanzisha upya server.

## Usalama uliojengwa ndani (security hardening)

- Password zote zimesimbwa kwa **bcrypt** (cost factor 12); hazihifadhiwi
  wala kuonekana popote kwa maandishi wazi.
- **Vikwazo vya jaribio la kuingia (login lockout):** akaunti inafungwa
  kwa dakika 15 baada ya majaribio 5 yasiyofanikiwa, kuzuia brute-force.
- **Session zenye usalama:** zimehifadhiwa Postgres (si kwenye kumbukumbu
  ya server tu), na cookie za `httpOnly`, `sameSite=lax`, na `secure`
  (HTTPS-only) zikiwa production.
- **Ulinzi wa CSRF:** kila ombi la kubadilisha data (POST/DELETE) lazima
  liwe na token ya CSRF inayolingana na session, isiyoweza kudukuliwa na
  tovuti nyingine.
- **Helmet + Content-Security-Policy** kuzuia XSS na clickjacking.
- **Rate limiting** kwenye login/register (dhidi ya udukuzi wa nywila) na
  kwenye API nzima (dhidi ya matumizi mabaya/DoS ndogo).
- **Uthibitishaji thabiti wa role kwa kila endpoint** (server-side
  authorization) — hakuna kitendo kinachotegemea taarifa kutoka kwa
  kivinjari pekee.
- **SQL zote ni parameterized queries** (hakuna string-concatenation),
  kuzuia SQL injection.
- **Uthibitishaji wa data zote zinazoingia** (jina, barua pepe, password
  yenye ugumu wa chini kabisa, tarehe, ukubwa wa saini) kabla ya
  kuhifadhiwa.
- Ujumbe wa hitilafu ya login ni wa jumla ("email au password si sahihi")
  ili kuzuia mtu kugundua kama email fulani ipo kwenye mfumo
  (account-enumeration protection).
- Usajili wa umma (`/register`) unaruhusu tu role za
  **student / industrial / university** — role za **faculty** na
  **superadmin** huundwa na Superadmin aliyepo kwenye mfumo pekee, kuzuia
  mtu yeyote kujipatia madaraka ya juu.
- Hitilafu za server hazionyeshi stack trace wala maelezo ya ndani kwa
  mtumiaji.

## Kuendesha kwenye kompyuta yako (local development)

Mahitaji: Node.js 18+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env      # kisha jaza DATABASE_URL na SESSION_SECRET yako
npm run dev
```

Fungua http://localhost:3000 . Server itaunda tables zote moja kwa moja
(schema.sql) na kuunda akaunti ya kwanza ya Superadmin kutoka
SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD ulizoweka kwenye `.env`, kama hakuna
Superadmin bado.

**Baada ya kuingia mara ya kwanza kama Superadmin, badilisha password
yake mara moja kupitia "Wasifu Wangu".**

## Ku-host kwenye Render

### Njia rahisi — Blueprint (render.yaml)

Faili la `render.yaml` limejumuishwa. Kwenye Render dashboard:

1. **New +** → **Blueprint**, unganisha repo hii ya GitHub.
2. Render itaunda Postgres database (`iptms-db`) na Web Service (`iptms`)
   moja kwa moja, ikiweka `DATABASE_URL` na `SESSION_SECRET` kiotomatiki.
3. Kwenye Environment ya service, weka `SUPERADMIN_NAME`,
   `SUPERADMIN_EMAIL`, na `SUPERADMIN_PASSWORD` (hizi hazitajazwa
   kiotomatiki — Render itakuomba uziweke).
4. Bonyeza **Apply**. Baada ya deploy kukamilika, fungua URL ya service,
   ingia kama Superadmin, kisha badilisha password yake mara moja.

### Njia ya mikono (manual)

1. Unda **PostgreSQL** database mpya kwenye Render, nakili
   `Internal Database URL` yake.
2. Unda **Web Service** mpya kutoka repo hii:
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Kwenye Environment Variables za service, weka:
   - `DATABASE_URL` = internal URL ya database uliyoiunda hapo juu
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = string ndefu ya nasibu (tumia
     `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `SUPERADMIN_NAME`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`
4. Deploy. Server itaunda tables na Superadmin wa awali kiotomatiki
   kwenye boot ya kwanza.

> Render's free web services sleep after inactivity na free Postgres
> databases expire baada ya siku 90 — kwa matumizi ya muda mrefu/uzalishaji
> halisi, tumia paid plan ili database na data zisipotee.

## Muundo wa mfumo (majukumu ya kila role)

| Role | Majukumu |
|---|---|
| **Mwanafunzi (student)** | Kujaza na kuwasilisha logbook ya kila siku (saini yake mwenyewe inatumika moja kwa moja); kuomba ruhusa; kufuatilia hali ya idhini; kuchapisha logbook zilizoruhusiwa. |
| **Industrial Supervisor** | Kukagua na kuidhinisha logbook za wanafunzi walioko field; kuidhinisha/kukataa maombi ya ruhusa. |
| **University Supervisor** | Kutathmini logbook zilizoidhinishwa na Industrial Supervisor, kuandika maoni, kuwasilisha kwa Head of Faculty. |
| **Head of Faculty** | Kutoa idhini ya mwisho, kuandika remarks za kitivo, na kuamua kama mwanafunzi aruhusiwe kuchapisha logbook husika. |
| **Superadmin** | Kusimamia watumiaji wote (kuongeza/kufuta, ikiwemo Head of Faculty na Superadmin wengine), kuona dashibodi ya takwimu, na kukagua audit trail ya matukio yote ya kiusalama. |

Kila hatua ya idhini ina "stepper" inayoonyesha maendeleo
(Mwanafunzi → Industrial → University → Faculty), na kila kitendo
kinachobadilisha data kinarekodiwa kwenye Audit Trail (muda, mtumiaji,
role, na kitendo chenyewe).

## Muundo wa faili

```
server/
  index.js          Express app: usalama (helmet/session/CSRF/rate-limit), routing
  db.js             Muunganiko wa PostgreSQL + kuunda Superadmin wa kwanza
  schema.sql        Muundo wa tables zote
  helpers.js        Uthibitishaji wa data (validation) + audit log helper
  middleware/auth.js  requireAuth / requireRole / csrfProtection
  routes/           auth, users, logbooks, permissions, audit, dashboard
public/
  index.html, styles.css, app.js   Frontend (vanilla JS, hakuna framework)
```
