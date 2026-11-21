begin;

-- Allow a full batch of up to five prepared receipt images through the
-- existing reservation preflight. The provider still enforces its own limits.
update public.ai_policy
set max_input_tokens = 50000, updated_at = now()
where singleton = true;

commit;
