"""Look after registered accounts. Run from backend/ with DATABASE_URL set (or through scripts/accounts.ps1):

  python -m app.manage list
  python -m app.manage role <username> resident|society_admin|ward_officer
  python -m app.manage password <username>        (asks for the new password; signs the person out everywhere)
  python -m app.manage delete <username>          (removes the sign-in and email; their entries stay, without their name)
"""
import argparse
import getpass

from sqlalchemy import delete, select

from .auth import ROLES, end_all_sessions, hash_password
from .db import SessionLocal, init_db
from .models import Account, User
from .routers.accounts import password_problem


def find(db, username: str):
    row = db.execute(select(Account, User).join(User, User.id == Account.user_id).where(Account.username == username.lower())).first()
    if row is None:
        raise SystemExit(f"no account with the username {username!r}")
    return row


def set_role(db, username: str, role: str):
    _, user = find(db, username)
    user.role = role
    db.commit()


def set_password(db, username: str, password: str):
    acc, user = find(db, username)
    problem = password_problem(password, acc.username, acc.email)
    if problem:
        raise SystemExit(f"that password cannot be used ({problem})")
    acc.password_hash = hash_password(password)
    end_all_sessions(db, user.id)
    db.commit()


def delete_account(db, username: str):
    acc, user = find(db, username)
    end_all_sessions(db, user.id)
    db.execute(delete(Account).where(Account.user_id == user.id))
    user.name = "Former member"
    db.commit()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    for name in ("role", "password", "delete"):
        p = sub.add_parser(name)
        p.add_argument("username")
        if name == "role":
            p.add_argument("role", choices=ROLES)
    a = ap.parse_args(argv)
    init_db()
    with SessionLocal() as db:
        if a.cmd == "list":
            rows = db.execute(select(Account, User).join(User, User.id == Account.user_id).order_by(Account.created_at)).all()
            for acc, user in rows:
                print(f"{acc.created_at:%Y-%m-%d %H:%M}  {acc.username:<30} {user.role:<14} {user.society.name if user.society else '-':<26} {acc.email}")
            print(f"{len(rows)} account(s)")
        elif a.cmd == "role":
            set_role(db, a.username, a.role)
            print("done")
        elif a.cmd == "password":
            first = getpass.getpass("New password (hidden): ")
            if first != getpass.getpass("Again: "):
                raise SystemExit("the two passwords are different; nothing changed")
            set_password(db, a.username, first)
            print("done; the person has to sign in again")
        elif input(f"Delete the account {a.username}? Type YES: ") == "YES":
            delete_account(db, a.username)
            print("deleted")
        else:
            print("nothing changed")


if __name__ == "__main__":
    main()
