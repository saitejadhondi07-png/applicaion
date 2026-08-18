import pyodbc
import json

conn = pyodbc.connect('Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=EnduranceDb;UID=sa;PWD=admin;Encrypt=yes;TrustServerCertificate=yes;')
cursor = conn.cursor()

cursor.execute("SELECT TOP 5 RawDataJson FROM Reports WHERE GeneratedDataJson LIKE '%TGA563300B20%' ORDER BY UploadDate DESC")
rows = cursor.fetchall()

if len(rows) > 0:
    for r in rows:
        raw_json = r[0]
        if not raw_json: continue
        
        data = json.loads(raw_json)
        # Find TGA563300B20 in the raw data?
        # Actually, RawDataJson in the DB might just be the entire CSV.
        
        # Let's inspect the keys of the first item
        if isinstance(data, list) and len(data) > 0:
            # Let's find unique step_id and step_state
            step_states = set()
            for row in data:
                # Need to find the key for step id and state
                step_id = None
                state = None
                for k, v in row.items():
                    kl = k.lower()
                    if 'step' in kl and 'id' in kl:
                        step_id = v
                    if 'state' in kl or 'step_state' in kl:
                        state = v
                if step_id is not None and state is not None:
                    step_states.add((str(step_id), str(state)))
            
            print("Unique (Step, State) combinations:")
            for s in sorted(list(step_states)):
                print(s)
            break
