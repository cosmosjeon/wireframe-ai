UPDATE plans SET 
  stripe_price_id_monthly = 'price_1SraJkKGmi2jWs7hGqgcEoOV',
  stripe_price_id_yearly = 'price_1SraJsKGmi2jWs7hBmf6N5a7'
WHERE id = 'pro';

UPDATE generation_packages SET stripe_price_id = 'price_1SraKAKGmi2jWs7hKi4DQe5m' WHERE id = 'pack_50';
UPDATE generation_packages SET stripe_price_id = 'price_1SraKBKGmi2jWs7htr1stgCg' WHERE id = 'pack_150';
UPDATE generation_packages SET stripe_price_id = 'price_1SraKDKGmi2jWs7h26iPuhQ6' WHERE id = 'pack_500';
UPDATE generation_packages SET stripe_price_id = 'price_1SraKEKGmi2jWs7hasTSRr4L' WHERE id = 'pack_2000';
