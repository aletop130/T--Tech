#!/usr/bin/env python3
"""
Script to validate and mark invalid TLEs in the database.
This is a one-time cleanup script for MVP.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.session import SessionLocal
from app.db.models.ontology import Orbit
from sgp4.api import Satrec


def validate_tle(line1: str, line2: str) -> bool:
    """Check if TLE is valid using SGP4."""
    if not line1 or not line2:
        return False
    
    try:
        sat = Satrec.twoline2rv(line1.strip(), line2.strip())
        return sat.error == 0
    except Exception:
        return False


def cleanup_invalid_tles(dry_run: bool = True):
    """Find and mark invalid TLEs in the database."""
    db = SessionLocal()
    
    try:
        orbits = db.query(Orbit).filter(
            Orbit.tle_line1.isnot(None),
            Orbit.tle_line2.isnot(None),
        ).all()
        
        invalid_count = 0
        valid_count = 0
        
        for orbit in orbits:
            is_valid = validate_tle(orbit.tle_line1, orbit.tle_line2)
            
            if is_valid:
                valid_count += 1
                if orbit.is_tle_valid is None:
                    orbit.is_tle_valid = True
            else:
                invalid_count += 1
                print(f"Invalid TLE: orbit_id={orbit.id}, satellite_id={orbit.satellite_id}")
                
                if not dry_run:
                    orbit.is_tle_valid = False
        
        if not dry_run:
            db.commit()
            print(f"\nCommitted changes to database.")
        
        print(f"\nSummary:")
        print(f"  Total orbits checked: {len(orbits)}")
        print(f"  Valid TLEs: {valid_count}")
        print(f"  Invalid TLEs: {invalid_count}")
        
        if dry_run:
            print(f"\nDRY RUN - no changes made. Run with --apply to save changes.")
        
    finally:
        db.close()


if __name__ == '__main__':
    dry_run = '--apply' not in sys.argv
    cleanup_invalid_tles(dry_run=dry_run)
