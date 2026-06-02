import os
import json
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from main import app, Base, get_db, load_dataset, build_pdf_report, DBUser, DBAuditJob, DBTestResult

# Setup test database
TEST_DATABASE_URL = "sqlite:///./test_evalcore.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override database dependency in FastAPI app
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

def setup_module():
    # Create test tables
    Base.metadata.create_all(bind=engine)

def teardown_module():
    # Remove test database file
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("test_evalcore.db"):
        os.remove("test_evalcore.db")

def test_load_dataset():
    """Verify that dataset loads successfully and has 5000 items."""
    dataset = load_dataset()
    assert len(dataset) == 5000
    assert dataset[0]["category"] == "Security"

def test_api_dataset_preview():
    """Test the dataset preview endpoint."""
    response = client.get("/api/dataset")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 5000

def test_user_auth_flow():
    """Test user signup, login, and protected route access."""
    # 1. Signup
    signup_data = {
        "email": "testuser@evalcore.com", 
        "password": "securepassword123",
        "account_type": "company",
        "company_name": "EvalCore Inc",
        "user_role": "Security Auditor"
    }
    response = client.post("/api/auth/signup", json=signup_data)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["email"] == "testuser@evalcore.com"
    assert res_data["account_type"] == "company"
    assert res_data["company_name"] == "EvalCore Inc"
    assert res_data["user_role"] == "Security Auditor"

    # 2. Duplicate Signup should fail
    response = client.post("/api/auth/signup", json=signup_data)
    assert response.status_code == 400

    # 3. Login
    login_data = {"username": "testuser@evalcore.com", "password": "securepassword123"}
    response = client.post("/api/auth/login", data=login_data)
    assert response.status_code == 200
    tokens = response.json()
    assert "access_token" in tokens
    assert tokens["token_type"] == "bearer"

    token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 4. Access protected audit endpoint (validation fail instead of 401 Unauthorized)
    audit_data = {
        "target_api_url": "http://localhost:8000/api/dataset",
        "target_api_key": "dummy-key",
        "target_model_name": "gpt-3.5-turbo",
        "selected_categories": ["Security"]
    }
    response = client.post("/api/audit", json=audit_data, headers=headers)
    assert response.status_code == 200
    assert "job_id" in response.json()

    # 5. Access without token should fail
    response = client.post("/api/audit", json=audit_data)
    assert response.status_code == 401

def test_pdf_generation_via_db():
    """Verify PDF report builder logic using SQLite data models."""
    db = TestingSessionLocal()
    
    # Create test user
    user = DBUser(
        email="pdfuser@evalcore.com", 
        hashed_password="hashed_placeholder",
        account_type="individual",
        user_role="Developer"
    )
    db.add(user)
    db.commit()
    
    # Create test audit job
    job_id = "test-job-uuid-56789"
    job = DBAuditJob(
        id=job_id,
        user_id=user.id,
        status="COMPLETED",
        progress=100.0,
        target_api_url="http://localhost:8000/api/dataset",
        target_model_name="test-model",
        overall_compliance_score=100.0,
        total_audited=1,
        safe_count=1,
        warnings_count=0,
        violations_count=0,
        category_breakdown_json=json.dumps({"Security": 100.0})
    )
    db.add(job)
    
    # Create test result
    res = DBTestResult(
        job_id=job_id,
        test_id="SEC-JB-0001",
        category="Security",
        subcategory="Jailbreak",
        prompt="Test Prompt",
        target_response="Response",
        evaluation_criteria="Criteria",
        regulatory_mapping="Article 15",
        score=100,
        verdict="SAFE",
        justification="Justification text",
        regulatory_infringement="None"
    )
    db.add(res)
    db.commit()

    pdf_filename = f"report_{job_id}.pdf"
    pdf_path = os.path.join(os.path.dirname(__file__), pdf_filename)
    
    try:
        build_pdf_report(job, [res], pdf_path)
        assert os.path.exists(pdf_path)
        assert os.path.getsize(pdf_path) > 0
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
        db.close()

if __name__ == "__main__":
    setup_module()
    try:
        print("Running automated database and auth tests...")
        test_load_dataset()
        print("✓ Dataset loading test passed.")
        test_api_dataset_preview()
        print("✓ API dataset endpoint test passed.")
        test_user_auth_flow()
        print("✓ User Signup, JWT Login & Protected routes tests passed.")
        test_pdf_generation_via_db()
        print("✓ Database-backed PDF report builder test passed.")
        print("\nAll database & auth verification tests passed successfully!")
    finally:
        teardown_module()
