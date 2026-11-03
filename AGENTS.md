
- Clicksign: only template documents create full contracts; signed plain-PDF documents create contracts with data_pending=true (PDF saved to the private contract-pdfs bucket on receipt because Clicksign links expire); AI output is stored only in contracts.suggested_data until a user confirms. Distrato/aditivo are detected by file/template name and never create contracts.
