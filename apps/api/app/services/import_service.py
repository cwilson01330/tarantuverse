import csv
import json
import io
from typing import List, Dict, Any, Tuple
from fastapi import UploadFile, HTTPException
import openpyxl
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from app.schemas.tarantula import TarantulaCreate
from pydantic import ValidationError

class ImportService:
    @staticmethod
    async def process_file(file: UploadFile) -> Tuple[List[TarantulaCreate], List[str]]:
        """
        Process an uploaded file and return a list of valid TarantulaCreate objects and a list of errors.
        """
        content = await file.read()
        filename = file.filename.lower()
        
        data = []
        
        try:
            if filename.endswith('.csv'):
                data = ImportService._parse_csv(content)
            elif filename.endswith('.json'):
                data = ImportService._parse_json(content)
            elif filename.endswith('.xlsx') or filename.endswith('.xls'):
                data = ImportService._parse_excel(content)
            else:
                raise HTTPException(status_code=400, detail="Unsupported file format. Please upload .csv, .json, or .xlsx file.")
        except Exception as e:
             raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")

        valid_tarantulas = []
        errors = []

        for index, row in enumerate(data):
            try:
                # Normalize keys and values
                normalized_row = ImportService._normalize_row(row)
                tarantula = TarantulaCreate(**normalized_row)
                valid_tarantulas.append(tarantula)
            except ValidationError as e:
                errors.append(f"Row {index + 1}: {str(e)}")
            except Exception as e:
                errors.append(f"Row {index + 1}: Unexpected error: {str(e)}")

        return valid_tarantulas, errors

    @staticmethod
    def _parse_csv(content: bytes) -> List[Dict[str, Any]]:
        text = content.decode('utf-8')
        reader = csv.DictReader(io.StringIO(text))
        return list(reader)

    @staticmethod
    def _parse_json(content: bytes) -> List[Dict[str, Any]]:
        return json.loads(content.decode('utf-8'))

    @staticmethod
    def _parse_excel(content: bytes) -> List[Dict[str, Any]]:
        workbook = openpyxl.load_workbook(filename=io.BytesIO(content), data_only=True)
        sheet = workbook.active
        
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            return []
            
        headers = rows[0]
        data = []
        for row in rows[1:]:
            row_dict = {}
            for i, value in enumerate(row):
                if i < len(headers) and headers[i]:
                    row_dict[str(headers[i])] = value
            data.append(row_dict)
        return data

    @staticmethod
    def _normalize_row(row: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize keys to match TarantulaCreate schema and convert values.
        """
        normalized = {}
        
        # Map common variations of column names to schema fields
        key_mapping = {
            'name': 'name',
            'pet name': 'name',
            'common name': 'common_name',
            'scientific name': 'scientific_name',
            'species': 'scientific_name',
            'sex': 'sex',
            'gender': 'sex',
            'date acquired': 'date_acquired',
            'acquired date': 'date_acquired',
            'source': 'source',
            'origin': 'source',
            'price': 'price_paid',
            'price paid': 'price_paid',
            'cost': 'price_paid',
            # 'enclosure type': 'enclosure_type',
            # 'type': 'enclosure_type', # Be careful with this one
            'enclosure size': 'enclosure_size',
            'size': 'enclosure_size',
            'substrate': 'substrate_type',
            'substrate type': 'substrate_type',
            'substrate depth': 'substrate_depth',
            'notes': 'notes',
            'comments': 'notes'
        }

        for key, value in row.items():
            clean_key = str(key).lower().strip()
            if clean_key in key_mapping:
                target_key = key_mapping[clean_key]
                normalized[target_key] = value
            elif clean_key in TarantulaCreate.model_fields:
                normalized[clean_key] = value

        # Value conversions
        if 'sex' in normalized:
            sex = str(normalized['sex']).lower().strip()
            if sex in ['m', 'male']: normalized['sex'] = 'male'
            elif sex in ['f', 'female']: normalized['sex'] = 'female'
            else: normalized['sex'] = 'unknown'

        if 'source' in normalized:
             source = str(normalized['source']).lower().strip()
             if 'bred' in source: normalized['source'] = 'bred'
             elif 'bought' in source or 'purchase' in source: normalized['source'] = 'bought'
             elif 'wild' in source: normalized['source'] = 'wild_caught'
        
        # if 'enclosure_type' in normalized:
        #     enc = str(normalized['enclosure_type']).lower().strip()
        #     if 'terr' in enc: normalized['enclosure_type'] = 'terrestrial'
        #     elif 'arb' in enc: normalized['enclosure_type'] = 'arboreal'
        #     elif 'foss' in enc: normalized['enclosure_type'] = 'fossorial'

        # Date conversion
        date_fields = ['date_acquired', 'last_substrate_change', 'last_enclosure_cleaning']
        for field in date_fields:
            if field in normalized and normalized[field]:
                val = normalized[field]
                if isinstance(val, (datetime, date)):
                    normalized[field] = val
                elif isinstance(val, str):
                    try:
                        # Try common formats
                        for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d']:
                            try:
                                normalized[field] = datetime.strptime(val, fmt).date()
                                break
                            except ValueError:
                                continue
                    except:
                        pass # Let pydantic validation handle it if it fails

        # Decimal conversion
        decimal_fields = ['price_paid', 'target_temp_min', 'target_temp_max', 'target_humidity_min', 'target_humidity_max']
        for field in decimal_fields:
            if field in normalized and normalized[field]:
                try:
                    normalized[field] = Decimal(str(normalized[field]).replace('$', '').replace(',', ''))
                except:
                    pass

        # Temporary fix: remove enclosure_type as it causes DB error due to missing Enum type
        if 'enclosure_type' in normalized:
            del normalized['enclosure_type']

        return normalized
