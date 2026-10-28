-- Compras: apenas o Alex (perfil cujo nome começa com "Alex") pode alterar custo_final.
create or replace function public.restringe_custo_final_alex()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.custo_final is distinct from old.custo_final and auth.uid() is not null then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and lower(p.nome) like 'alex%'
    ) then
      raise exception 'Somente o Alex pode definir o custo final.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_restringe_custo_final_alex on public.pedido_itens;
create trigger trg_restringe_custo_final_alex
before update on public.pedido_itens
for each row execute function public.restringe_custo_final_alex();
