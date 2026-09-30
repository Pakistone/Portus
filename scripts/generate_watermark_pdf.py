#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Générateur de PDF A4 Paysage avec filigrane de sécurité textuel haute densité.
Bibliothèque requise : reportlab (pip install reportlab)
"""

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.pdfgen import canvas
import sys

def draw_security_watermark(c: canvas.Canvas, width: float, height: float):
    """
    Tapisse intégralement le fond de la page avec un filigrane textuel
    horizontal, dense et répétitif.
    """
    watermark_text = "UCRPPLAO-CI / UCRAO-CI  CSCRAO   "
    font_name = "Helvetica-Bold"
    font_size = 4.8  # Petite écriture fine de sécurité (micro-texte)
    
    # Sauvegarde de l'état graphique
    c.saveState()
    
    # 1. Configuration de la police
    c.setFont(font_name, font_size)
    
    # 2. Couleur gris-vert de sécurité (#BED6CC / #C2D6CC)
    watermark_color = colors.HexColor('#BED6CC')
    c.setFillColor(watermark_color)
    
    # 3. Transparence de 35% (alpha = 0.35)
    c.setFillAlpha(0.35)
    
    # Calcul exact de la largeur du motif pour une mosaïque 100% sans couture (seamless)
    unit_width = c.stringWidth(watermark_text, font_name, font_size)
    step_y = 10.2  # Espacement vertical serré (~3.6mm)
    
    # 4. Répétition en mosaïque sans couture continue
    row_index = 0
    y = 0.0
    while y <= height + step_y:
        # Décalage en quinconce une ligne sur deux (élimine toute couture)
        shift_x = (unit_width / 2.0) if (row_index % 2 == 1) else 0.0
        
        x = -shift_x - unit_width
        while x <= width + unit_width:
            c.drawString(x, y, watermark_text)
            x += unit_width
            
        y += step_y
        row_index += 1
        
    # Restauration de l'état graphique initial (alpha et couleurs réinitialisés)
    c.restoreState()

def draw_demo_ticket_grid(c: canvas.Canvas, width: float, height: float):
    """
    Exemple de tracé de tickets de surveillance par-dessus le filigrane.
    Démontre que le filigrane reste visible en arrière-plan.
    """
    c.saveState()
    
    cols = 3
    rows = 3
    ticket_width = width / cols
    ticket_height = height / rows
    
    # Tracé des grilles de tickets
    c.setLineWidth(0.75)
    c.setStrokeColor(colors.HexColor('#1E293B'))
    
    for r in range(rows):
        for col in range(cols):
            x = col * ticket_width
            y = r * ticket_height
            
            # Cadre extérieur du ticket avec marge intérieure
            margin = 3
            c.rect(x + margin, y + margin, ticket_width - (margin * 2), ticket_height - (margin * 2), fill=0)
            
            # En-tête de ticket
            header_height = 24
            c.setFillColor(colors.HexColor('#0F4C3A'))
            c.rect(x + margin, y + ticket_height - margin - header_height, ticket_width - (margin * 2), header_height, fill=1)
            
            # Titre dans l'en-tête
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 8)
            c.drawCentredString(x + (ticket_width / 2), y + ticket_height - margin - 15, "SURVEILLANCE CAMION — U.J.S.R.V.")
            
    c.restoreState()

def generate_pdf(output_filename: str = "tickets_securises_avec_filigrane.pdf", total_pages: int = 2):
    """
    Génère le document PDF complet au format A4 Paysage.
    """
    # Format A4 Paysage (Landscape) : 841.89 pt x 595.27 pt (297mm x 210mm)
    page_width, page_height = landscape(A4)
    
    c = canvas.Canvas(output_filename, pagesize=(page_width, page_height))
    
    for page_num in range(1, total_pages + 1):
        # 5. ORDRE DES COUCHES :
        # Le filigrane est obligatoirement dessiné EN PREMIER sur le canvas
        draw_security_watermark(c, page_width, page_height)
        
        # Ensuite, tracés par-dessus (tickets, textes, QR codes, etc.)
        draw_demo_ticket_grid(c, page_width, page_height)
        
        # Numéro de page
        c.setFont("Helvetica", 6)
        c.setFillColor(colors.HexColor('#334155'))
        c.drawString(10, 10, f"Page {page_num}/{total_pages} — Document Sécurisé")
        
        c.showPage()
        
    c.save()
    print(f"Document PDF généré avec succès : {output_filename}")

if __name__ == "__main__":
    output_file = sys.argv[1] if len(sys.argv) > 1 else "tickets_securises_avec_filigrane.pdf"
    generate_pdf(output_file)
