# AWA Address Service — README

## Yleiskuvaus

AWA Address Service on Authentication Centerin **sisäinen RPC-palvelu**.  
Se palauttaa sähköpostiin liittyvän **credentialsAddress**-arvon (256 bittiä).

Palvelulla ei ole julkista API:a.  
Default-fetch vastaa aina **404** pitkässä välimuistissa.  
Ainoa käyttö tapahtuu RPC-metodin kautta Authentication Centerin muista workereista.

---

## Vastuut

- **Kanonisoi** käyttäjän syöttämän sähköpostin deterministisesti.
- **Laskee pseudonyymin indeksin** HMAC-128:lla käyttäen `KID_CURRENT`ia sekä tarvittaessa legacy-KIDejä.
- **Hakee credentialsAddressin** oikeasta shardista.
- **Luo uuden credentialsAddressin** jos mitään ei löydy, tallentaen sen `KID_CURRENT`in mukaisesti.
- **Mahdollistaa migraation** sähköpostista toiseen (`migrateAddressToNewEmail`).
- **Palauttaa vain credentialsAddressin**. Ei mitään muuta.

---

## RPC

- **Metodi:**

  - `AwaAddressService.getAddressFromEmail(email: string)`
  - `AwaAddressService.migrateAddressToNewEmail(oldEmail: string, newEmail: string)`

- **Paluuarvo:**
  - `{ credentialsAddress }`

---

## Ympäristösidonnat

- `KID_CURRENT` — nykyinen avaimen tunniste.
- `KID_OLDEST` — vanhimman aktiivisen legacy-avaimen tunniste.
- Secret Storesta haetaan avaimet nimillä `address_hmac_key.<KID>`.
- Lookup kiertää: `KID_CURRENT → … → KID_OLDEST`.
- Vain `KID_CURRENT`illa luodaan uusia rivejä.

---

## Kanonisointi

- Unicode NFC + lower-case.
- Domainit IDNA/punycode.
- Domain-spesifiset säännöt:
  - `gmail.com`: strip `+tag`, poista pisteet local-osasta.
  - Muut: ei tag-stripiä, ei pistepoistoa ellei erikseen määritelty.

---

## Indeksi ja shardaus

- **pseudonymousIndex** = HMAC-128(canonicalEmail, key[KID])
- **vShard** ei ole kiinteä emailiin → se voi muuttua KID-rotaation tai email-migraation mukana.
- **pShard** määräytyy aina kulloisenkin `KID_CURRENT`in laskeman vShardin perusteella.
- **credentialsAddress** on 256-bittinen satunnaisblob, pysyvä käyttäjätunniste, joka ei muutu KID-rotaatioissa eikä sähköpostin vaihdossa.

---

## Email-migraatio

- Käytetään `migrateAddressToNewEmail(oldEmail, newEmail)`.
- Palvelu etsii käyttäjän nykyisen `credentialsAddress`in vanhalla emaililla (legacy-KID:t sallittu).
- Lasketaan `pseudonymousIndex` uudelle emailille `KID_CURRENT`illa.
- Luodaan uusi rivi uuteen shardiin samalla `credentialsAddress`illa.
- Käyttäjän identiteetti pysyy samana, vaikka email vaihtuu.

---

## Tietomalli (pShard)

Taulu `addresses` sisältää:

- `vShard` (INTEGER, 0…1 048 575)
- `KID` (TEXT)
- `pseudonymousIndex` (BLOB 16, HMAC-128)
- `credentials_address` (BLOB 32)
- `created_at` (INTEGER, ms)
- `last_seen_at` (INTEGER, ms)

PK = `(vShard, KID, pseudonymousIndex)`

---

## Käyttö Authentication Centerissä

1. Authenticator kutsuu `getAddressFromEmail(email)`.
2. Address Service palauttaa `credentialsAddress`.
3. Authenticator käyttää sitä Credentials-palvelussa.
4. Jos käyttäjä vaihtaa emailia, kutsutaan `migrateAddressToNewEmail`.
5. Muilla workereilla ei ole mitään käyttöä muista tiedoista.

---

## Turva

- Raaka sähköposti ei tallennu.
- Avaimet vain Secret Storessa.
- Ulos ei paljasteta sharditietoja, KID:iä, indeksejä tai aikaleimoja.
- Lokit sisältävät vain tapahtumakoodit (lookup.hit/miss, insert, migrate, db.error).

---

## Default-fetch

Palauttaa aina **404** otsikolla:  
Cache-Control: public, max-age=31536000, immutable
