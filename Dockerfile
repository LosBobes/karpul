# Stage 1: production build of the frontend.
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: FastAPI backend serving the API and the frontend build from one origin.
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# The IP-to-country database behind KARPUL_ALLOWED_COUNTRIES (app/geofence.py).
COPY backend/fetch_geoip.py ./
RUN python fetch_geoip.py /app/geoip/country.mmdb
COPY backend/app ./app
COPY --from=frontend /frontend/dist ./static

ENV KARPUL_FRONTEND_DIST=/app/static \
    DATABASE_URL=sqlite:////data/karpul.db

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
