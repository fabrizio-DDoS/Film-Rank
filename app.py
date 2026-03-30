from flask import Flask, jsonify
from flask_cors import CORS
import requests
app = Flask(__name__)
CORS(app)

API_KEY = "d6a174f07e735136d75dec40dfc75704"

@app.route("/movies/popular")
def popular_movies():

    url = f"https://api.themoviedb.org/3/movie/popular?api_key={API_KEY}"

    response = requests.get(url)
    data = response.json()

    movies = []

    for movie in data["results"]:
        movies.append({
            "id": movie["id"],
            "title": movie["title"],
            "year": movie["release_date"][:4] if movie["release_date"] else "",
            "poster": f"https://image.tmdb.org/t/p/w500{movie['poster_path']}",
            "rating": movie["vote_average"]
        })

    return jsonify(movies)

if __name__ == "__main__":
    app.run(debug=True)