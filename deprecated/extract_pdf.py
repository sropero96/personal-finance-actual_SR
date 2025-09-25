import pdfplumber
import sys

def extract_pdf_text(pdf_path):
    """Extract text from PDF using pdfplumber"""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            full_text = ""
            for page_num, page in enumerate(pdf.pages, 1):
                text = page.extract_text()
                if text:
                    full_text += f"\n--- PAGE {page_num} ---\n"
                    full_text += text
                    full_text += "\n"
            
            return full_text
    except Exception as e:
        return f"Error extracting PDF: {str(e)}"

if __name__ == "__main__":
    pdf_path = "/Users/sebiropero_personal/sropero/Developer/personal-finance-actual_SR/PDF_MOVIMIENTOS_SANTANDER.pdf"
    text = extract_pdf_text(pdf_path)
    print(text)
