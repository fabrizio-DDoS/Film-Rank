"""
app.py — CinéRank Backend
─────────────────────────────────────────────────────────────
Melhorias implementadas:
  1. Usa /movie/top_rated em vez de /movie/popular
  2. Busca múltiplas páginas (padrão: 10 páginas = ~200 filmes)
  3. Mapeia IDs de gênero para nomes
  4. Inclui sinopse (overview) e diretor (via credits)
  5. Autenticação via Supabase JWT
  6. Rotas para salvar/carregar listas dos usuários no Supabase
─────────────────────────────────────────────────────────────
Dependências:
  pip install flask flask-cors requests supabase python-dotenv
"""

import os
import requests
from functools import lru_cache
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# ── Supabase ──────────────────────────────────────────────────
# pip install supabase
from supabase import create_client, Client

load_dotenv()  # lê o arquivo .env

app = Flask(__name__)
# Durante desenvolvimento aceita qualquer origem.
# Em produção, troque por: origins=["https://SEU_DOMINIO.vercel.app"]
CORS(app)

# ── Credenciais ────────────────────────────────────────────────
TMDB_KEY       = os.getenv("TMDB_API_KEY", "d6a174f07e735136d75dec40dfc75704")
SUPABASE_URL   = os.getenv("SUPABASE_URL", "https://nqaqgcjhvldlbstwpags.supabase.co")       # cole a URL do seu projeto Supabase
SUPABASE_KEY   = os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xYXFnY2podmxkbGJzdHdwYWdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MDc1NzAsImV4cCI6MjA5MDQ4MzU3MH0.N0auhzzdXUKAAJVrgwY37n_dOSHR_GEoOtZSdTKYYxg")  # cole a anon/public key

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL else None

TMDB_BASE = "https://api.themoviedb.org/3"
IMG_BASE  = "https://image.tmdb.org/t/p/w500"


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def fetch_genre_map() -> dict:
    """Retorna {id: nome} de todos os gêneros de filme do TMDB."""
    url = f"{TMDB_BASE}/genre/movie/list?api_key={TMDB_KEY}&language=pt-BR"
    try:
        r = requests.get(url, timeout=10)
        genres = r.json().get("genres", [])
        return {g["id"]: g["name"] for g in genres}
    except Exception:
        return {}


def fetch_director(movie_id: int) -> str:
    """Busca o nome do diretor de um filme (1 chamada extra por filme)."""
    url = f"{TMDB_BASE}/movie/{movie_id}/credits?api_key={TMDB_KEY}"
    try:
        r = requests.get(url, timeout=8)
        crew = r.json().get("crew", [])
        directors = [p["name"] for p in crew if p.get("job") == "Director"]
        return directors[0] if directors else ""
    except Exception:
        return ""


def get_current_user(req):
    """
    Extrai e valida o JWT do Supabase enviado no header Authorization.
    Retorna o user_id (str) ou levanta erro 401.
    """
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, (jsonify({"error": "Token ausente"}), 401)

    token = auth_header.split(" ", 1)[1]
    try:
        user = supabase.auth.get_user(token)
        return user.user.id, None
    except Exception:
        return None, (jsonify({"error": "Token inválido"}), 401)


# ─────────────────────────────────────────────────────────────
# ROTA: FILMES MAIS FAMOSOS (top rated)
# ─────────────────────────────────────────────────────────────

@app.route("/movies/popular")
def popular_movies():
    """
    Retorna filmes mais bem avaliados de todos os tempos.
    Query params:
      pages (int): quantas páginas buscar, 1-20 (default: 10) → até 200 filmes
    """
    pages_to_fetch = min(int(request.args.get("pages", 10)), 20)
    genre_map      = fetch_genre_map()
    movies         = []
    seen_ids       = set()

    for page in range(1, pages_to_fetch + 1):
        url = (
            f"{TMDB_BASE}/movie/top_rated"
            f"?api_key={TMDB_KEY}&language=pt-BR&page={page}"
        )
        try:
            r    = requests.get(url, timeout=10)
            data = r.json()
        except Exception as e:
            print(f"Erro na página {page}: {e}")
            continue

        for m in data.get("results", []):
            if m["id"] in seen_ids:
                continue
            seen_ids.add(m["id"])

            # Pular filmes sem poster
            if not m.get("poster_path"):
                continue

            genre_names = [
                genre_map.get(gid, "")
                for gid in m.get("genre_ids", [])
                if genre_map.get(gid)
            ]

            movies.append({
                "id":          m["id"],
                "title":       m["title"],
                "year":        m["release_date"][:4] if m.get("release_date") else "",
                "poster":      f"{IMG_BASE}{m['poster_path']}",
                "rating":      round(m.get("vote_average", 0), 1),
                "votes":       m.get("vote_count", 0),
                "description": m.get("overview", ""),
                "genres":      genre_names,
                "director":    "",  # Preenchido sob demanda em /movies/<id>
            })

    # Ordenar por nota × votos (filmes mais conhecidos e bem avaliados primeiro)
    movies.sort(key=lambda m: m["rating"] * (m["votes"] ** 0.3), reverse=True)

    return jsonify(movies)


# ─────────────────────────────────────────────────────────────
# ROTA: DETALHE DE UM FILME (inclui diretor)
# ─────────────────────────────────────────────────────────────

@app.route("/movies/<int:movie_id>")
def movie_detail(movie_id):
    """Retorna detalhes completos de um filme, incluindo diretor."""
    genre_map = fetch_genre_map()
    url = f"{TMDB_BASE}/movie/{movie_id}?api_key={TMDB_KEY}&language=pt-BR"
    try:
        r = requests.get(url, timeout=10)
        m = r.json()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    director    = fetch_director(movie_id)
    genre_names = [g["name"] for g in m.get("genres", [])]

    return jsonify({
        "id":          m["id"],
        "title":       m["title"],
        "year":        m.get("release_date", "")[:4],
        "poster":      f"{IMG_BASE}{m['poster_path']}" if m.get("poster_path") else "",
        "rating":      round(m.get("vote_average", 0), 1),
        "votes":       m.get("vote_count", 0),
        "description": m.get("overview", ""),
        "genres":      genre_names,
        "director":    director,
        "runtime":     m.get("runtime"),
    })


# ─────────────────────────────────────────────────────────────
# AUTENTICAÇÃO — gerenciada pelo Supabase no frontend
# (signup / login acontecem direto do JS com o Supabase SDK)
# O backend só valida o token JWT nas rotas protegidas.
# ─────────────────────────────────────────────────────────────


# ─────────────────────────────────────────────────────────────
# ROTA: LISTA DO USUÁRIO (salvar / carregar)
# ─────────────────────────────────────────────────────────────

@app.route("/user/list", methods=["GET"])
def get_user_list():
    """Carrega os filmes assistidos e scores ELO do usuário autenticado."""
    if not supabase:
        return jsonify({"error": "Supabase não configurado"}), 503

    user_id, err = get_current_user(request)
    if err:
        return err

    result = (
        supabase.table("user_movies")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    return jsonify(result.data)


@app.route("/user/list", methods=["POST"])
def save_user_list():
    """
    Salva (upsert) a lista completa de filmes + scores ELO do usuário.
    Body JSON: { movies: [{movie_id, elo_score, added_at}] }
    """
    if not supabase:
        return jsonify({"error": "Supabase não configurado"}), 503

    user_id, err = get_current_user(request)
    if err:
        return err

    body   = request.get_json(force=True)
    movies = body.get("movies", [])

    rows = [
        {
            "user_id":   user_id,
            "movie_id":  m["movie_id"],
            "elo_score": m.get("elo_score", 1200),
            "added_at":  m.get("added_at"),
        }
        for m in movies
    ]

    # upsert: atualiza se já existe, insere se não existe
    result = (
        supabase.table("user_movies")
        .upsert(rows, on_conflict="user_id,movie_id")
        .execute()
    )
    return jsonify({"saved": len(result.data)})


@app.route("/user/list/<int:movie_id>", methods=["DELETE"])
def remove_from_list(movie_id):
    """Remove um filme específico da lista do usuário."""
    if not supabase:
        return jsonify({"error": "Supabase não configurado"}), 503

    user_id, err = get_current_user(request)
    if err:
        return err

    supabase.table("user_movies") \
        .delete() \
        .eq("user_id", user_id) \
        .eq("movie_id", movie_id) \
        .execute()

    return jsonify({"removed": movie_id})


# ─────────────────────────────────────────────────────────────
# ROTA: COMPARAÇÕES (salvar resultado ELO)
# ─────────────────────────────────────────────────────────────

@app.route("/compare", methods=["POST"])
def record_comparison():
    """
    Registra o resultado de uma comparação entre dois filmes.
    Body: { winner: movie_id, loser: movie_id, winner_elo: int, loser_elo: int }
    """
    if not supabase:
        return jsonify({"ok": True})  # sem banco, só retorna ok

    user_id, err = get_current_user(request)
    if err:
        return err

    body = request.get_json(force=True)

    # Atualiza ELO do vencedor
    supabase.table("user_movies") \
        .update({"elo_score": body["winner_elo"]}) \
        .eq("user_id", user_id) \
        .eq("movie_id", body["winner"]) \
        .execute()

    # Atualiza ELO do perdedor
    supabase.table("user_movies") \
        .update({"elo_score": body["loser_elo"]}) \
        .eq("user_id", user_id) \
        .eq("movie_id", body["loser"]) \
        .execute()

    return jsonify({"ok": True})


# ─────────────────────────────────────────────────────────────
# INICIALIZAÇÃO
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(debug=True, port=port)
