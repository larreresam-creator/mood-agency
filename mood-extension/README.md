# Mood Agency — Instagram Scout
## Extension Chrome

---

## Installation (2 minutes)

1. Ouvre Chrome et va sur : chrome://extensions/
2. Active le **Mode développeur** (toggle en haut à droite)
3. Clique sur **"Charger l'extension non empaquetée"**
4. Sélectionne le dossier **mood-extension**
5. L'extension est installée ✓

---

## Comment ça marche

1. Va sur n'importe quel profil Instagram
2. Un panneau **mood.** s'ouvre automatiquement à droite
3. Il détecte :
   - Le nom, handle, nombre d'abonnés, bio
   - La niche (Moto, Food, Fitness, Mode...)
   - Les collabs détectées (#ad, #sponsored, @mentions)
4. Tu choisis le talent associé et tu cliques :
   - **"Ajouter au CRM"** → le prospect apparaît dans ton CRM
   - **"Ajouter à la Veille"** → le créateur apparaît dans ta Veille

---

## Synchroniser avec le CRM

Pour que les données de l'extension apparaissent dans ton fichier CRM :

1. Ouvre ton fichier `mood_agency_crm.html` dans Chrome
2. Ouvre la console (F12 → Console)
3. Colle ce code :

```javascript
chrome.storage.local.get(['mood_crm','mood_veille'], (r) => {
  if(r.mood_crm) localStorage.setItem('mood_crm', JSON.stringify(r.mood_crm));
  if(r.mood_veille) localStorage.setItem('mood_veille', JSON.stringify(r.mood_veille));
  location.reload();
});
```

4. Appuie sur Entrée → la page se recharge avec toutes les données

---

## Notes

- L'extension lit uniquement ce qui est visible sur la page
- Elle ne se connecte à aucun serveur externe
- Toutes les données restent dans ton navigateur Chrome
