from app.database.database import engine, Base, SessionLocal
from app.models.user import User
from app.models.transaction import Transaction, TransactionType
from app.models.category import Category
from datetime import datetime, timedelta
import random

def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # Check if data already exists
    if db.query(User).first():
        print("Database already initialized.")
        return

    # Create user
    user = User(
        username="demo",
        email="demo@example.com",
        hashed_password="...", # Not used for this demo setup
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create Categories
    categories = [
        ("Alquiler", TransactionType.EXPENSE),
        ("Comida", TransactionType.EXPENSE),
        ("Ocio", TransactionType.EXPENSE),
        ("Sueldo", TransactionType.INCOME),
        ("Inversión", TransactionType.EXPENSE)
    ]
    cat_objs = {}
    for name, cat_type in categories:
        cat = Category(name=name, type=cat_type, user_id=user.id)
        db.add(cat)
        db.commit()
        db.refresh(cat)
        cat_objs[name] = cat

    # Create Sample Transactions
    # 1. Monthly Salary
    db.add(Transaction(
        amount=2500.0,
        type=TransactionType.INCOME,
        description="Sueldo Abril",
        date=datetime.now() - timedelta(days=5),
        user_id=user.id,
        category_id=cat_objs["Sueldo"].id
    ))

    # 2. Fixed Expenses
    db.add(Transaction(
        amount=800.0,
        type=TransactionType.EXPENSE,
        description="Alquiler",
        date=datetime.now() - timedelta(days=4),
        user_id=user.id,
        category_id=cat_objs["Alquiler"].id
    ))

    # 3. Random Expenses (making sure ~500 remain)
    expenses = [
        ("Supermercado", 300.0, "Comida"),
        ("Cena con amigos", 50.0, "Ocio"),
        ("Internet", 40.0, "Alquiler"),
        ("Suscripciones", 15.0, "Ocio"),
        ("Gasolina", 100.0, "Alquiler"),
    ]

    for desc, amt, cat_name in expenses:
        db.add(Transaction(
            amount=amt,
            type=TransactionType.EXPENSE,
            description=desc,
            date=datetime.now() - timedelta(days=random.randint(1, 4)),
            user_id=user.id,
            category_id=cat_objs[cat_name].id
        ))

    db.commit()
    print("Database initialized with sample data.")

if __name__ == "__main__":
    init_db()
