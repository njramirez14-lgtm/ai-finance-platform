from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.entity import Entity
from srv.schemas.entity import EntityCreate, EntityOut, EntityUpdate

router = APIRouter(prefix="/entities", tags=["entities"])


@router.post("/", response_model=EntityOut, status_code=status.HTTP_201_CREATED)
def create_entity(
    payload: EntityCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    entity = Entity(
        user_id=current_user.id,
        name=payload.name,
        type=payload.type,
        tax_id=payload.tax_id,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


@router.get("/", response_model=list[EntityOut])
def list_entities(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return (
        db.query(Entity)
        .filter(Entity.user_id == current_user.id)
        .order_by(Entity.created_at.asc())
        .all()
    )


@router.put("/{entity_id}", response_model=EntityOut)
def update_entity(
    entity_id: int,
    payload: EntityUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    entity = (
        db.query(Entity)
        .filter(Entity.id == entity_id, Entity.user_id == current_user.id)
        .first()
    )
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    if payload.name is not None:
        entity.name = payload.name
    if payload.type is not None:
        entity.type = payload.type
    if payload.tax_id is not None:
        entity.tax_id = payload.tax_id

    db.commit()
    db.refresh(entity)
    return entity


@router.delete("/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entity(
    entity_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    entity = (
        db.query(Entity)
        .filter(Entity.id == entity_id, Entity.user_id == current_user.id)
        .first()
    )
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    db.delete(entity)
    db.commit()
    return None
