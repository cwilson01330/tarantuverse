import requests
import os

API_URL = "http://localhost:8000"
EMAIL = "tarantulafan@example.com"
PASSWORD = "testpass123"
CSV_FILE = "sample_import.csv"

def get_token():
    response = requests.post(f"{API_URL}/api/v1/auth/login", json={
        "email": EMAIL,
        "password": PASSWORD
    })
    if response.status_code != 200:
        print(f"Failed to login: {response.text}")
        return None
    return response.json()["access_token"]

def test_import(token):
    if not os.path.exists(CSV_FILE):
        print(f"File {CSV_FILE} not found.")
        return

    with open(CSV_FILE, "rb") as f:
        files = {"file": (CSV_FILE, f, "text/csv")}
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.post(f"{API_URL}/api/v1/import/collection", files=files, headers=headers)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")

if __name__ == "__main__":
    print("Getting token...")
    token = get_token()
    if token:
        print("Token obtained. Testing import...")
        test_import(token)
