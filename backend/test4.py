import psycopg2
import os
print("connecting...")
conn = psycopg2.connect(os.environ["DATABASE_URL"])
print("connected")
cur = conn.cursor()
print("executing...")
cur.execute("SELECT * FROM users LIMIT 1;")
print("executed")
print(cur.fetchone())
