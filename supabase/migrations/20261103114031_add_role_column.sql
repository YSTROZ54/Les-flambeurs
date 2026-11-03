-- Colonne "role" sur accounts : Patron / Co Fondateur / Flambeur (badge affiché, voir js/3d/hud3d.js et api/accounts.js).
-- N'accorde aucun pouvoir d'administration à elle seule : ADMINS (api/accounts.js) reste la seule source du pouvoir Patron.
alter table accounts add column if not exists role text not null default 'flambeur';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'accounts_role_check'
  ) then
    alter table accounts add constraint accounts_role_check check (role in ('flambeur', 'co_fondateur', 'patron'));
  end if;
end $$;

-- Rattrapage pour les comptes déjà connus (sans écraser un rôle déjà posé à la main)
update accounts set role = 'patron' where username in ('ystroz', 'alex') and role = 'flambeur';
update accounts set role = 'co_fondateur' where username in ('yohan81') and role = 'flambeur';
