FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app/backend

COPY backend/requirements.txt ./requirements.txt

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY backend /app/backend

RUN chmod +x /app/backend/scripts/railway-predeploy.sh /app/backend/scripts/railway-start.sh

EXPOSE 3000

CMD ["/app/backend/scripts/railway-start.sh"]
