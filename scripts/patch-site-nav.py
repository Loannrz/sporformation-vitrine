#!/usr/bin/env python3
"""Réinjecte la navigation complète dans les HTML vitrine (une passe)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

HTML_FILES = [
    ROOT / "index.html",
    ROOT / "a-propos.html",
    ROOT / "apprentissage.html",
    ROOT / "certificat-qualiopi.html",
    ROOT / "contact.html",
    ROOT / "formation-detail.html",
    ROOT / "formations.html",
    ROOT / "formulaire-employeur.html",
    ROOT / "handicap.html",
    ROOT / "inscription-prepa-tep.html",
    ROOT / "mentions-legales.html",
    ROOT / "politique-de-confidentialite.html",
    ROOT / "tep.html",
]


def fragment(cta_href_attr: str, cta_label: str) -> str:
    # cta_href_attr ex: 'href="/contact.html"' ou 'href="#formulaire"'
    return f"""    <div class="container nav">
      <a class="nav__brand" href="/">
        <img class="nav__logo-img" src="/assets/logos/spor-formation-logo.png" width="728" height="343" alt="SporFormation — Retour à l'accueil">
      </a>
      <div class="nav__desktop">
        <nav aria-label="Navigation principale">
          <ul class="nav__list">
            <li class="nav__item"><a class="nav__link" href="/">Accueil</a></li>
            <li class="nav__item">
              <button type="button" class="nav__menu-button">Formations</button>
              <div class="nav__dropdown">
                <ul class="nav__dropdown-list">
                  <li><a class="nav__dropdown-link" href="/formations.html">Voir toutes les formations</a></li>
                  <li><a class="nav__dropdown-link" href="/formation-detail.html?f=bp-jeps-mapst&amp;v=Courbevoie">BPJEPS MAPST</a></li>
                  <li><a class="nav__dropdown-link" href="/formation-detail.html?f=bp-jeps-aspf&amp;v=Courbevoie">BPJEPS APSF (forme)</a></li>
                  <li><a class="nav__dropdown-link" href="/formation-detail.html?f=bp-jeps-basket&amp;v=Courbevoie">BPJEPS Basket-ball</a></li>
                  <li><a class="nav__dropdown-link" href="/formation-detail.html?f=bp-jeps-rugby&amp;v=Courbevoie">BPJEPS Rugby à XV</a></li>
                  <li><a class="nav__dropdown-link" href="/formation-detail.html?f=bp-jeps-asec&amp;v=Courbevoie">BPJEPS Animateur ASEC</a></li>
                  <li><a class="nav__dropdown-link" href="/formation-detail.html?f=cc-acm&amp;v=Courbevoie">CC Directeur ACM</a></li>
                  <li><a class="nav__dropdown-link" href="/formation-detail.html?f=de-jeps-asec-coordination&amp;v=Courbevoie">DEJEPS ASEC — coordination</a></li>
                  <li><a class="nav__dropdown-link" href="/formation-detail.html?f=tfp-cdssa&amp;v=Paris%207e">TFP CDSSA</a></li>
                </ul>
              </div>
            </li>
            <li class="nav__item">
              <button type="button" class="nav__menu-button">Apprentissage</button>
              <div class="nav__dropdown">
                <ul class="nav__dropdown-list">
                  <li><a class="nav__dropdown-link" href="/apprentissage.html">Apprentissage &amp; employeurs</a></li>
                  <li><a class="nav__dropdown-link" href="/formulaire-employeur.html">Formulaire employeur</a></li>
                </ul>
              </div>
            </li>
            <li class="nav__item">
              <button type="button" class="nav__menu-button">Préparation TEP</button>
              <div class="nav__dropdown">
                <ul class="nav__dropdown-list">
                  <li><a class="nav__dropdown-link" href="/tep.html">Diagnostic &amp; préparation TEP</a></li>
                  <li><a class="nav__dropdown-link" href="/inscription-prepa-tep.html">Inscription prépa TEP</a></li>
                </ul>
              </div>
            </li>
            <li class="nav__item">
              <button type="button" class="nav__menu-button">À propos</button>
              <div class="nav__dropdown">
                <ul class="nav__dropdown-list">
                  <li><a class="nav__dropdown-link" href="/certificat-qualiopi.html">Certificat Qualiopi</a></li>
                  <li><a class="nav__dropdown-link" href="/a-propos.html">Qui sommes-nous&nbsp;?</a></li>
                  <li><a class="nav__dropdown-link" href="/a-propos.html#resultats">Résultats</a></li>
                  <li><a class="nav__dropdown-link" href="/a-propos.html#couts">Coûts &amp; prises en charge</a></li>
                  <li><a class="nav__dropdown-link" href="/a-propos.html#aides-apprentis">Les aides aux apprentis</a></li>
                  <li><a class="nav__dropdown-link" href="/a-propos.html#partenaires">Nos partenaires</a></li>
                </ul>
              </div>
            </li>
            <li class="nav__item"><a class="nav__link" href="/handicap.html">Handicap</a></li>
            <li class="nav__item"><a class="nav__link" href="/contact.html">Contact</a></li>
          </ul>
        </nav>
        <a class="btn btn--primary nav__cta" {cta_href_attr}>{cta_label}</a>
      </div>
      <button class="nav__toggle" type="button" id="menu-toggle" aria-expanded="false" aria-controls="mobile-nav" aria-label="Ouvrir le menu">
        <span class="nav__toggle-line"></span>
        <span class="nav__toggle-line"></span>
        <span class="nav__toggle-line"></span>
      </button>
    </div>
  </header>

  <div class="mobile-nav__overlay" id="mobile-nav-overlay"></div>
  <aside class="mobile-nav" id="mobile-nav" aria-label="Menu mobile">
    <nav>
      <ul class="mobile-nav__list">
        <li><a class="mobile-nav__link" href="/">Accueil</a></li>
        <li>
          <details>
            <summary class="mobile-nav__summary">Formations</summary>
            <div class="mobile-nav__sublist">
              <a href="/formations.html">Voir toutes les formations</a>
              <a href="/formation-detail.html?f=bp-jeps-mapst&amp;v=Courbevoie">BPJEPS MAPST</a>
              <a href="/formation-detail.html?f=bp-jeps-aspf&amp;v=Courbevoie">BPJEPS APSF (forme)</a>
              <a href="/formation-detail.html?f=bp-jeps-basket&amp;v=Courbevoie">BPJEPS Basket-ball</a>
              <a href="/formation-detail.html?f=bp-jeps-rugby&amp;v=Courbevoie">BPJEPS Rugby à XV</a>
              <a href="/formation-detail.html?f=bp-jeps-asec&amp;v=Courbevoie">BPJEPS Animateur ASEC</a>
              <a href="/formation-detail.html?f=cc-acm&amp;v=Courbevoie">CC Directeur ACM</a>
              <a href="/formation-detail.html?f=de-jeps-asec-coordination&amp;v=Courbevoie">DEJEPS ASEC — coordination</a>
              <a href="/formation-detail.html?f=tfp-cdssa&amp;v=Paris%207e">TFP CDSSA</a>
            </div>
          </details>
        </li>
        <li>
          <details>
            <summary class="mobile-nav__summary">Apprentissage</summary>
            <div class="mobile-nav__sublist">
              <a href="/apprentissage.html">Apprentissage &amp; employeurs</a>
              <a href="/formulaire-employeur.html">Formulaire employeur</a>
            </div>
          </details>
        </li>
        <li>
          <details>
            <summary class="mobile-nav__summary">Préparation TEP</summary>
            <div class="mobile-nav__sublist">
              <a href="/tep.html">Diagnostic &amp; préparation TEP</a>
              <a href="/inscription-prepa-tep.html">Inscription prépa TEP</a>
            </div>
          </details>
        </li>
        <li>
          <details>
            <summary class="mobile-nav__summary">À propos</summary>
            <div class="mobile-nav__sublist">
              <a href="/certificat-qualiopi.html">Certificat Qualiopi</a>
              <a href="/a-propos.html">Qui sommes-nous&nbsp;?</a>
              <a href="/a-propos.html#resultats">Résultats</a>
              <a href="/a-propos.html#couts">Coûts &amp; prises en charge</a>
              <a href="/a-propos.html#aides-apprentis">Les aides aux apprentis</a>
              <a href="/a-propos.html#partenaires">Nos partenaires</a>
            </div>
          </details>
        </li>
        <li><a class="mobile-nav__link" href="/handicap.html">Handicap</a></li>
        <li><a class="mobile-nav__link" href="/contact.html">Contact</a></li>
      </ul>
      <a class="btn btn--primary mobile-nav__cta" {cta_href_attr}>{cta_label}</a>
    </nav>
  </aside>
"""


def patch_file(path: Path) -> None:
    raw = path.read_text(encoding="utf-8")
    if path.name == "contact.html":
        cta_attr = 'href="#formulaire"'
        cta_label = "Poser une question"
    else:
        cta_attr = 'href="/contact.html"'
        cta_label = "S'inscrire maintenant"

    frag = fragment(cta_attr, cta_label)

    header_start = raw.find("<header")
    if header_start == -1:
        raise SystemExit(f"Pas de <header dans {path}")
    header_open_end = raw.find(">", header_start) + 1

    container_start = raw.find('<div class="container nav">', header_start)
    if container_start == -1:
        raise SystemExit(f"Pas de .container nav dans {path}")

    aside_end = raw.find("</aside>", container_start)
    if aside_end == -1:
        raise SystemExit(f"Pas de </aside> après le menu dans {path}")
    aside_end += len("</aside>")
    while aside_end < len(raw) and raw[aside_end] in "\r\n":
        aside_end += 1

    new_body = raw[:header_open_end] + "\n" + frag + raw[aside_end:]
    path.write_text(new_body, encoding="utf-8")
    print(f"OK {path.relative_to(ROOT)}")


def main() -> None:
    for p in HTML_FILES:
        if not p.is_file():
            raise SystemExit(f"Manquant: {p}")
        patch_file(p)


if __name__ == "__main__":
    main()
