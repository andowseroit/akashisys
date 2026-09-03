-- Create profiles only for the currently verified administrator accounts.
INSERT INTO public.profiles (id, role, name)
VALUES
  (
    '5580ef47-bf20-4417-98df-b157485a1f76',
    'admin',
    'Admin'
  ),
  (
    'd578719b-0b3a-45ce-aec4-ff6dbbf6efbf',
    'admin',
    'Admin'
  )
ON CONFLICT (id) DO NOTHING;